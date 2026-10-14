import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDailyEntry,
  buildExperiment,
  experimentsReducer,
} from "../src/features/experiments/model/actions";
import {
  compareMetric,
  comparisonText,
  getProgress,
  groupObservations,
  summarizeMetric,
  endDate,
} from "../src/features/experiments/model/analytics";
import {
  getDailyEntrySchema,
  newExperimentSchema,
} from "../src/features/experiments/model/schemas";
import type {
  DailyEntry,
  MetricValues,
  NewExperiment,
} from "../src/features/experiments/model/types";
import { AppError } from "../src/lib/errors";
import { addDays, dayOffset, localDate } from "../src/lib/dates";
import { formatCount, formatDate, formatNumber } from "../src/lib/format";
import { LEGACY_EXPERIMENTS } from "../src/features/experiments/data/legacy-experiments";
import { adaptLegacyExperiment, decodeWorkspace } from "../src/features/experiments/data/migration";
import { createSampleExperiments } from "../src/features/experiments/data/mock-experiments";
import { t } from "../src/i18n";

const TODAY = "2026-10-14";
const draft: NewExperiment = {
  title: "  Morning walks  ",
  question: "Do I feel better on days when I walk?",
  habit: "Take a 20-minute walk",
  durationDays: 28,
  metrics: ["mood", "energy"],
};
const experiment = buildExperiment(draft, "experiment", TODAY);
function entry(
  index: number,
  habitStatus: DailyEntry["habitStatus"],
  values: MetricValues = { mood: 6 },
): DailyEntry {
  return {
    id: `entry-${index}`,
    observedDate: addDays(TODAY, -index),
    recordedAt: null,
    updatedAt: null,
    habitStatus,
    values,
    note: "",
    origin: habitStatus === null ? "legacy_ab" : "check_in",
  };
}
function coded(code: string) {
  return (error: unknown) => error instanceof AppError && error.code === code;
}

test("two different experiments receive separate IDs and no previous fields or entries", () => {
  const first = buildExperiment(draft, "first", TODAY),
    second = buildExperiment(
      {
        ...draft,
        title: "Less coffee",
        question: "Do I sleep better without late coffee?",
        habit: "Avoid coffee after 2 pm",
        metrics: ["sleep"],
      },
      "second",
      TODAY,
    );
  const state = experimentsReducer(
    experimentsReducer([], { type: "experimentCreated", experiment: first }),
    { type: "experimentCreated", experiment: second },
  );
  assert.equal(state.length, 2);
  assert.equal(first.title, "Morning walks");
  assert.equal(second.title, "Less coffee");
  assert.deepEqual(second.metrics, ["sleep"]);
  assert.deepEqual(first.entries, []);
  assert.deepEqual(second.entries, []);
  assert.equal(draft.title, "  Morning walks  ");
});
test("creation rejects blank text, invalid durations, and missing or duplicate metrics", () => {
  for (const field of ["title", "question", "habit"])
    assert.equal(newExperimentSchema.safeParse({ ...draft, [field]: "  " }).success, false);
  for (const durationDays of [0, -1, 1.5, 366, NaN, Infinity])
    assert.equal(newExperimentSchema.safeParse({ ...draft, durationDays }).success, false);
  for (const metrics of [[], ["mood", "mood"], ["unknown"]])
    assert.equal(newExperimentSchema.safeParse({ ...draft, metrics }).success, false);
  assert.equal(newExperimentSchema.safeParse({ ...draft, durationDays: 365 }).success, true);
});
test("check-ins require an explicit habit choice and do not invent scores or notes", () => {
  const schema = getDailyEntrySchema(["mood", "energy"]);
  assert.equal(schema.safeParse({ values: {} }).success, false);
  assert.equal(schema.safeParse({ habitStatus: null, values: {} }).success, false);
  const result = buildDailyEntry(
    experiment,
    { habitStatus: "not_done", values: {} },
    "entry",
    TODAY,
    TODAY,
  );
  assert.equal(result.habitStatus, "not_done");
  assert.deepEqual(result.values, {});
  assert.equal(result.note, "");
});
test("optional scores reject invalid values and metrics not selected for the experiment", () => {
  const schema = getDailyEntrySchema(["mood"]);
  for (const values of [
    { mood: 0 },
    { mood: 11 },
    { mood: 4.5 },
    { mood: NaN },
    { mood: Infinity },
    { energy: 5 },
  ])
    assert.equal(schema.safeParse({ habitStatus: "done", values }).success, false);
  assert.equal(
    schema.safeParse({ habitStatus: "done", values: {}, note: "a".repeat(501) }).success,
    false,
  );
  assert.deepEqual(
    schema.parse({ habitStatus: "done", values: { mood: 7 }, note: "  Quiet day  " }).note,
    "Quiet day",
  );
});
test("future check-ins and dates outside the observation window are rejected", () => {
  assert.throws(
    () =>
      buildDailyEntry(
        experiment,
        { habitStatus: "done", values: {} },
        "id",
        addDays(TODAY, 1),
        TODAY,
      ),
    coded("futureEntry"),
  );
  assert.throws(
    () =>
      buildDailyEntry(
        experiment,
        { habitStatus: "done", values: {} },
        "id",
        addDays(TODAY, -1),
        TODAY,
      ),
    coded("outsideWindow"),
  );
  assert.throws(
    () =>
      buildDailyEntry(
        experiment,
        { habitStatus: "done", values: {} },
        "id",
        addDays(TODAY, 28),
        addDays(TODAY, 30),
      ),
    coded("outsideWindow"),
  );
});
test("editing replaces one date and preserves the ID without mutating earlier state", () => {
  const first = buildDailyEntry(
    experiment,
    { habitStatus: "done", values: { mood: 8 }, note: "First" },
    "first",
    TODAY,
    TODAY,
  );
  const saved = experimentsReducer([experiment], {
    type: "entrySaved",
    experimentId: experiment.id,
    entry: first,
  });
  const edit = buildDailyEntry(
    saved[0],
    { habitStatus: "not_done", values: { energy: 4 }, note: "Changed" },
    "replacement",
    TODAY,
    TODAY,
  );
  const next = experimentsReducer(saved, {
    type: "entrySaved",
    experimentId: experiment.id,
    entry: edit,
  });
  assert.equal(next[0].entries.length, 1);
  assert.equal(next[0].entries[0].id, "first");
  assert.equal(next[0].entries[0].habitStatus, "not_done");
  assert.deepEqual(next[0].entries[0].values, { energy: 4 });
  assert.equal(saved[0].entries[0].values.mood, 8);
  assert.equal(experiment.entries.length, 0);
});
test("local calendar dates differ correctly from UTC on either side of midnight", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "Pacific/Kiritimati";
    assert.equal(localDate(new Date("2026-10-14T20:00:00Z")), "2026-10-15");
    process.env.TZ = "America/Los_Angeles";
    assert.equal(localDate(new Date("2026-10-14T01:00:00Z")), "2026-10-13");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
  assert.equal(dayOffset("2026-10-24", "2026-10-26"), 2);
  assert.equal(dayOffset("2026-03-28", "2026-03-30"), 2);
});
test("recorded-day progress is distinct from calendar progress", () => {
  const stored = { ...experiment, entries: [entry(0, "not_done")] };
  assert.equal(getProgress(stored, addDays(TODAY, 7)).day, 8);
  assert.equal(getProgress(stored, addDays(TODAY, 7)).recorded, 1);
  assert.equal(getProgress(stored, addDays(TODAY, 27)).completed, false);
  assert.equal(getProgress(stored, addDays(TODAY, 28)).completed, true);
  assert.equal(endDate(stored), addDays(TODAY, 27));
});
test("not done, unclassified imports, and a missing check-in are different", () => {
  const groups = groupObservations([entry(0, "not_done"), entry(1, null), entry(2, "done")]);
  assert.equal(groups.notDone.length, 1);
  assert.equal(groups.done.length, 1);
  assert.equal(groups.unclassified.length, 1);
  assert.equal(groupObservations([]).notDone.length, 0);
});
test("averages count only available finite in-range scores", () => {
  assert.deepEqual(
    summarizeMetric(
      [
        entry(0, "done", { mood: 8 }),
        entry(1, "done", {}),
        entry(2, "done", { mood: NaN }),
        entry(3, "done", { mood: Infinity }),
        entry(4, "done", { mood: 11 }),
      ],
      "mood",
    ),
    { count: 1, average: 8 },
  );
  assert.deepEqual(summarizeMetric([], "mood"), { count: 0, average: null });
});
test("empty groups produce null differences instead of division by zero", () => {
  const result = compareMetric([], "mood");
  assert.equal(result.done.average, null);
  assert.equal(result.notDone.average, null);
  assert.equal(result.difference, null);
  assert.equal(result.conclusion, "insufficient");
  const one = compareMetric([entry(0, "done", { mood: 8 })], "mood");
  assert.equal(one.difference, null);
  assert.equal(one.enough, false);
});
test("comparison reports raw averages and differences after five scored days in each group", () => {
  const rows = [
    ...Array.from({ length: 5 }, (_, i) => entry(i, "done", { mood: 8 })),
    ...Array.from({ length: 5 }, (_, i) => entry(i + 5, "not_done", { mood: 5 })),
    entry(11, null, { mood: 10 }),
  ];
  const result = compareMetric(rows, "mood");
  assert.equal(result.done.average, 8);
  assert.equal(result.notDone.average, 5);
  assert.equal(result.difference, 3);
  assert.equal(result.conclusion, "higher");
  assert.equal(result.done.count, 5);
  assert.equal(comparisonText(result, "mood", t.analytics), t.analytics.higher("mood"));
});
test("threshold uses scored observations per metric, not total check-ins", () => {
  const rows = [
    ...Array.from({ length: 5 }, (_, i) => entry(i, "done", i === 0 ? {} : { mood: 8 })),
    ...Array.from({ length: 5 }, (_, i) => entry(i + 5, "not_done", { mood: 5 })),
  ];
  const result = compareMetric(rows, "mood");
  assert.equal(result.done.count, 4);
  assert.equal(result.conclusion, "insufficient");
  assert.equal(comparisonText(result, "mood", t.analytics), t.analytics.insufficient);
  assert.equal(compareMetric(rows, "energy").conclusion, "insufficient");
});
test("rule-based comparisons support lower and similar scores without causal language", () => {
  const rows = [
    ...Array.from({ length: 5 }, (_, i) => entry(i, "done", { mood: 4 })),
    ...Array.from({ length: 5 }, (_, i) => entry(i + 5, "not_done", { mood: 7 })),
  ];
  assert.equal(compareMetric(rows, "mood").conclusion, "lower");
  assert.doesNotMatch(
    comparisonText(compareMetric(rows, "mood"), "mood", t.analytics),
    /caused|statistically significant/,
  );
  const similar = rows.map((row) => ({ ...row, values: { mood: 6 } }));
  assert.equal(compareMetric(similar, "mood").conclusion, "similar");
});
test("legacy conversion preserves every original observation and never infers completion", () => {
  for (const legacy of LEGACY_EXPERIMENTS) {
    const copy = structuredClone(legacy);
    const converted = adaptLegacyExperiment(legacy);
    assert.deepEqual(converted.legacy, copy);
    assert.equal(converted.entries.length, legacy.entries.length);
    for (const [i, row] of converted.entries.entries()) {
      assert.equal(row.habitStatus, null);
      assert.deepEqual(row.values, legacy.entries[i].values);
      assert.equal(row.note, legacy.entries[i].note);
      assert.equal(row.observedDate, legacy.entries[i].date);
      assert.equal(row.id, legacy.entries[i].id);
    }
    assert.equal(groupObservations(converted.entries).done.length, 0);
    assert.equal(groupObservations(converted.entries).notDone.length, 0);
    assert.deepEqual(legacy, copy);
  }
});
test("version-one snapshots migrate explicitly and sample seeds remain fictional", () => {
  const result = decodeWorkspace(JSON.stringify({ version: 1, experiments: LEGACY_EXPERIMENTS }));
  assert.equal(result.migrated, true);
  assert.equal(result.experiments[0].source, "user");
  const seeds = createSampleExperiments(TODAY);
  assert.equal(seeds.length, 4);
  assert.ok(seeds.every((item) => item.source === "sample"));
  assert.ok(seeds[0].entries.every((row) => row.observedDate < TODAY));
});
test("English formatters use the shared locale and correct singular labels", () => {
  assert.equal(formatNumber(6.25), "6.3");
  assert.equal(formatCount(1, "entry"), "1 entry");
  assert.equal(formatCount(2, "entry"), "2 entries");
  assert.equal(formatDate(TODAY), "Oct 14");
});

test("new observations are restricted to today or yesterday while older saved dates remain editable", () => {
  const startedEarlier = { ...experiment, startDate: addDays(TODAY, -10) };
  for (const observedDate of [TODAY, addDays(TODAY, -1)]) {
    const result = buildDailyEntry(
      startedEarlier,
      { habitStatus: "done", values: {} },
      "id",
      observedDate,
      TODAY,
      "2026-10-14T20:15:00.000Z",
    );
    assert.equal(result.observedDate, observedDate);
    assert.equal(result.recordedAt, "2026-10-14T20:15:00.000Z");
    assert.equal(result.updatedAt, null);
  }
  assert.throws(
    () =>
      buildDailyEntry(
        startedEarlier,
        { habitStatus: "not_done", values: {} },
        "id",
        addDays(TODAY, -2),
        TODAY,
      ),
    coded("recentEntryOnly"),
  );
  const existing = { ...entry(5, "done"), recordedAt: "2026-10-09T18:00:00.000Z" };
  const edited = buildDailyEntry(
    { ...startedEarlier, entries: [existing] },
    { habitStatus: "not_done", values: { mood: 4 } },
    "replacement",
    existing.observedDate,
    TODAY,
    "2026-10-14T20:20:00.000Z",
  );
  assert.equal(edited.observedDate, existing.observedDate);
  assert.equal(edited.id, existing.id);
  assert.equal(edited.recordedAt, existing.recordedAt);
  assert.equal(edited.updatedAt, "2026-10-14T20:20:00.000Z");
});
