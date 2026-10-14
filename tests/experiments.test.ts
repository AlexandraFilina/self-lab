import assert from "node:assert/strict";
import { test } from "node:test";
import { MOCK_EXPERIMENTS } from "../src/features/experiments/data/mock-experiments";
import {
  buildDailyEntry,
  buildExperiment,
  experimentsReducer,
} from "../src/features/experiments/model/actions";
import {
  dayOffset,
  endDate,
  getProgress,
  metricSummary,
  periodForDate,
} from "../src/features/experiments/model/analytics";
import {
  dateSchema,
  getDailyEntrySchema,
  newExperimentSchema,
} from "../src/features/experiments/model/schemas";
import type { NewExperiment } from "../src/features/experiments/model/types";
import { DEMO_DATE } from "../src/lib/config";
import { formatCount, formatDate, formatNumber } from "../src/lib/format";

const draft: NewExperiment = {
  title: "  A calmer morning  ",
  hypothesis: "A short walk may be associated with a better mood.",
  conditionA: "Keep my usual morning routine.",
  conditionB: "Take a 20-minute walk before work.",
  durationA: 14,
  durationB: 14,
  metrics: ["mood"],
};
const experiment = MOCK_EXPERIMENTS[0];

test("creation trims text and starts with no observations", () => {
  const result = buildExperiment(draft, "new-experiment", DEMO_DATE);
  assert.equal(result.title, "A calmer morning");
  assert.equal(result.startDate, DEMO_DATE);
  assert.deepEqual(result.entries, []);
  assert.equal(draft.title, "  A calmer morning  ");
});

test("schema rejects empty text, invalid durations, and invalid metric selections", () => {
  for (const title of ["", "   ", "a".repeat(121)])
    assert.equal(newExperimentSchema.safeParse({ ...draft, title }).success, false);
  for (const durationA of [0, -1, 1.5, 91, NaN, Infinity])
    assert.equal(newExperimentSchema.safeParse({ ...draft, durationA }).success, false);
  for (const metrics of [[], ["mood", "mood"], ["unknown"]])
    assert.equal(newExperimentSchema.safeParse({ ...draft, metrics }).success, false);
  assert.equal(
    newExperimentSchema.safeParse({ ...draft, durationA: 1, durationB: 90 }).success,
    true,
  );
});

test("calendar periods change at the A/B boundary and finish after the final day", () => {
  assert.equal(getProgress(experiment, experiment.startDate).day, 1);
  assert.equal(periodForDate(experiment, "2026-10-07"), "A");
  assert.equal(periodForDate(experiment, "2026-10-08"), "B");
  assert.equal(getProgress(experiment, "2026-10-07").period, "A");
  assert.equal(getProgress(experiment, "2026-10-08").periodDay, 1);
  assert.equal(getProgress(experiment, "2026-10-21").completed, false);
  assert.equal(getProgress(experiment, "2026-10-22").completed, true);
  assert.equal(endDate(experiment), "2026-10-21");
});

test("recorded progress is independent of calendar progress and the supplied clock", () => {
  const result = getProgress(experiment, DEMO_DATE);
  assert.equal(result.day, 20);
  assert.equal(result.periodDay, 6);
  assert.equal(result.recorded, 19);
  assert.equal(result.percent, 68);
  const fresh = buildExperiment(draft, "fresh", DEMO_DATE);
  assert.equal(getProgress(fresh, DEMO_DATE).percent, 0);
  assert.equal(getProgress(experiment, "2026-10-14").day, 21);
});

test("calendar day arithmetic is unaffected by daylight saving changes", () => {
  assert.equal(dayOffset("2026-10-24", "2026-10-26"), 2);
  assert.equal(dayOffset("2026-03-28", "2026-03-30"), 2);
  assert.equal(dateSchema.safeParse("2026-02-30").success, false);
});

test("comparison counts only available values and keeps missing periods empty", () => {
  assert.equal(metricSummary(experiment, "sleep", "A").count, 14);
  assert.equal(metricSummary(experiment, "sleep", "B").count, 5);
  assert.equal(metricSummary(MOCK_EXPERIMENTS[1], "sleep", "B").average, null);
  const partial = {
    ...experiment,
    entries: [
      { id: "one", date: experiment.startDate, values: { mood: 6 }, note: "" },
      { id: "two", date: "2026-09-25", values: { sleep: 8 }, note: "" },
    ],
  };
  assert.deepEqual(metricSummary(partial, "sleep", "A"), { count: 1, average: 8 });
});

test("check-ins require all selected metrics and valid integer scores", () => {
  const schema = getDailyEntrySchema(["mood"]);
  for (const values of [
    {},
    { mood: 0 },
    { mood: 11 },
    { mood: 4.5 },
    { mood: NaN },
    { mood: 5, sleep: 6 },
  ])
    assert.equal(schema.safeParse({ values, note: "" }).success, false);
  assert.equal(schema.safeParse({ values: { mood: 6 }, note: "a".repeat(501) }).success, false);
  assert.deepEqual(schema.parse({ values: { mood: 6 }, note: "  A quiet day.  " }), {
    values: { mood: 6 },
    note: "A quiet day.",
  });
});

test("check-ins cannot be recorded outside the scheduled periods", () => {
  const fresh = buildExperiment(draft, "fresh", DEMO_DATE);
  for (const date of ["2026-10-12", "2026-11-10"])
    assert.throws(
      () => buildDailyEntry(fresh, { values: { mood: 6 }, note: "" }, "entry", date),
      /scheduled periods/,
    );
});

test("editing replaces the same date, preserves the entry ID, and never mutates fixtures", () => {
  const initial = structuredClone(MOCK_EXPERIMENTS);
  const values = { sleep: 5, mood: 6, productivity: 7 };
  const entry = buildDailyEntry(
    initial[0],
    { values, note: " First note " },
    "entry-id",
    DEMO_DATE,
  );
  const saved = experimentsReducer(initial, {
    type: "entrySaved",
    experimentId: initial[0].id,
    entry,
  });
  assert.equal(saved[0].entries.length, initial[0].entries.length + 1);
  const editedEntry = buildDailyEntry(
    saved[0],
    { values: { ...values, sleep: 8 }, note: "Updated note" },
    "replacement-id",
    DEMO_DATE,
  );
  const edited = experimentsReducer(saved, {
    type: "entrySaved",
    experimentId: saved[0].id,
    entry: editedEntry,
  });
  assert.equal(editedEntry.id, "entry-id");
  assert.equal(edited[0].entries.length, saved[0].entries.length);
  assert.equal(edited[0].entries.at(-1)?.values.sleep, 8);
  assert.equal(edited[0].entries.at(-1)?.note, "Updated note");
  assert.equal(saved[0].entries.at(-1)?.values.sleep, 5);
  assert.equal(initial[0].entries.length, 19);
  assert.equal(edited[1], saved[1]);
});

test("created experiments are added first without altering existing state", () => {
  const result = buildExperiment(draft, "new-experiment", DEMO_DATE);
  const state = experimentsReducer(MOCK_EXPERIMENTS, {
    type: "experimentCreated",
    experiment: result,
  });
  assert.equal(state[0], result);
  assert.equal(state.length, MOCK_EXPERIMENTS.length + 1);
  assert.equal(state[1], MOCK_EXPERIMENTS[0]);
});

test("formatters use English numbers, dates, and singular labels", () => {
  assert.equal(formatNumber(6.25), "6.3");
  assert.equal(formatCount(1, "entry", "entries"), "1 entry");
  assert.equal(formatCount(2, "entry", "entries"), "2 entries");
  assert.equal(formatDate(DEMO_DATE), "Oct 13");
});
