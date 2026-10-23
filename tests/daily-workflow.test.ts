import assert from "node:assert/strict";
import { test } from "node:test";
import { localDate, addDays } from "../src/lib/dates";
import {
  buildExperiment,
  buildDailyEntry,
  experimentsReducer,
} from "../src/features/experiments/model/actions";
import { builtInMetric } from "../src/features/experiments/model/metrics";
import { applyLifecycle } from "../src/features/experiments/model/lifecycle";
import { createSampleExperiments } from "../src/features/experiments/data/mock-experiments";
import { createLocalStorageRepository } from "../src/features/experiments/data/local-storage-repository";
import { getDailyWorkflow } from "../src/features/dashboard/model/daily-workflow";

const TODAY = "2026-10-15";
const YESTERDAY = addDays(TODAY, -1);
function experiment(id: string, start = addDays(TODAY, -7), durationDays = 21) {
  return buildExperiment(
    {
      title: id,
      question: "How do walks relate to mood?",
      habit: "Take a walk",
      metrics: [builtInMetric("mood")],
      durationDays,
    },
    id,
    start,
  );
}
function record(
  item: ReturnType<typeof experiment>,
  date: string,
  status: "done" | "not_done" = "done",
) {
  const entry = buildDailyEntry(
    item,
    { habitStatus: status, values: { mood: 7 } },
    `${item.id}-${date}`,
    date,
    TODAY,
    "2026-10-15T12:00:00.000Z",
  );
  return experimentsReducer([item], { type: "entrySaved", experimentId: item.id, entry })[0];
}

test("an active user experiment without a today entry is a pending check-in", () => {
  const result = getDailyWorkflow([experiment("first")], TODAY);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].todayEntry, undefined);
  assert.equal(result.rows[0].canCheckInToday, true);
  assert.equal(result.checkedIn, 0);
  assert.equal(result.total, 1);
  assert.equal(result.caughtUp, false);
});
test("dashboard progress tracks elapsed observation days rather than saved entries", () => {
  const active = experiment("first", addDays(TODAY, -4), 14);
  const row = getDailyWorkflow([active], TODAY).rows[0];
  assert.equal(row.elapsedDays, 5);
  assert.equal(row.elapsedPercent, 36);
  assert.equal(row.experiment.entries.length, 0);
  assert.equal(
    getDailyWorkflow([experiment("future", addDays(TODAY, 1))], TODAY).rows[0].elapsedDays,
    0,
  );
  assert.equal(
    getDailyWorkflow([experiment("expired", addDays(TODAY, -20), 14)], TODAY).rows[0]
      .elapsedPercent,
    100,
  );
});
test("Done and Not done are both checked-in observations available to edit", () => {
  for (const status of ["done", "not_done"] as const) {
    const saved = record(experiment("first"), TODAY, status);
    const result = getDailyWorkflow([saved], TODAY);
    assert.equal(result.rows[0].todayEntry?.habitStatus, status);
    assert.equal(result.checkedIn, 1);
    assert.equal(result.caughtUp, true);
  }
});
test("saving a check-in immediately changes the derived summary and pending order", () => {
  const first = experiment("first"),
    second = experiment("second");
  assert.equal(getDailyWorkflow([first, second], TODAY).checkedIn, 0);
  const updated = record(first, TODAY);
  const result = getDailyWorkflow([updated, second], TODAY);
  assert.equal(result.checkedIn, 1);
  assert.equal(result.total, 2);
  assert.deepEqual(
    result.rows.map((row) => row.experiment.id),
    ["second", "first"],
  );
  assert.equal(getDailyWorkflow([updated, record(second, TODAY)], TODAY).caughtUp, true);
});
test("yesterday is available to add or edit only inside the observation target", () => {
  const active = experiment("first");
  const missing = getDailyWorkflow([active], TODAY).rows[0];
  assert.equal(missing.canCheckInYesterday, true);
  assert.equal(missing.yesterdayEntry, undefined);
  const saved = getDailyWorkflow([record(active, YESTERDAY)], TODAY).rows[0];
  assert.equal(saved.canCheckInYesterday, true);
  assert.equal(saved.yesterdayEntry?.observedDate, YESTERDAY);
  assert.equal(
    getDailyWorkflow([experiment("starts-today", TODAY)], TODAY).rows[0].canCheckInYesterday,
    false,
  );
  assert.equal(
    getDailyWorkflow([experiment("future", addDays(TODAY, 1))], TODAY).rows[0].canCheckInYesterday,
    false,
  );
});
test("older no-entry days never become a backlog or additional workflow rows", () => {
  const active = experiment("long-window", addDays(TODAY, -90), 180);
  const empty = getDailyWorkflow([active], TODAY);
  assert.equal(empty.rows.length, 1);
  assert.equal(empty.today, TODAY);
  assert.equal(empty.yesterday, YESTERDAY);
  const caughtYesterday = getDailyWorkflow([record(active, YESTERDAY)], TODAY);
  assert.equal(caughtYesterday.rows.length, 1);
  assert.equal(caughtYesterday.rows[0].canCheckInYesterday, true);
  assert.equal(caughtYesterday.rows[0].yesterdayEntry?.observedDate, YESTERDAY);
  assert.equal(caughtYesterday.rows[0].todayEntry, undefined);
  assert.equal(caughtYesterday.checkedIn, 0);
});
test("explicitly completed and fictional experiments never enter user pending tasks", () => {
  const completed = applyLifecycle(experiment("completed"), {
    type: "finish",
    completedAt: "2026-10-15T12:00:00.000Z",
  });
  const activeSample = { ...experiment("active-sample"), source: "sample" as const };
  const result = getDailyWorkflow(
    [completed, activeSample, ...createSampleExperiments(TODAY), experiment("user")],
    TODAY,
  );
  assert.deepEqual(
    result.rows.map((row) => row.experiment.id),
    ["user"],
  );
  assert.equal(result.total, 1);
});
test("pending and checked groups preserve the saved experiment order without modifying input", () => {
  const state = [
    record(experiment("checked-a"), TODAY),
    experiment("pending-a"),
    record(experiment("checked-b"), TODAY),
    experiment("pending-b"),
  ];
  const copy = structuredClone(state);
  assert.deepEqual(
    getDailyWorkflow(state, TODAY).rows.map((row) => row.experiment.id),
    ["pending-a", "pending-b", "checked-a", "checked-b"],
  );
  assert.deepEqual(state, copy);
});
test("expired active targets remain visible for lifecycle decisions without unavailable Today tasks", () => {
  const expired = experiment("expired", addDays(TODAY, -21), 21);
  const result = getDailyWorkflow([expired], TODAY);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].windowComplete, true);
  assert.equal(result.rows[0].canCheckInToday, false);
  assert.equal(result.rows[0].canCheckInYesterday, true);
  assert.equal(result.hasTargetDecisions, true);
  assert.equal(result.total, 0);
  assert.equal(result.caughtUp, false);
  const older = getDailyWorkflow([experiment("older-target", addDays(TODAY, -30), 21)], TODAY);
  assert.equal(older.rows[0].canCheckInYesterday, false);
  assert.equal(older.rows.length, 1);
});
test("a target-decision state prevents a misleading caught-up message", () => {
  const result = getDailyWorkflow(
    [record(experiment("checked"), TODAY), experiment("expired", addDays(TODAY, -21), 21)],
    TODAY,
  );
  assert.equal(result.checkedIn, 1);
  assert.equal(result.total, 1);
  assert.equal(result.hasTargetDecisions, true);
  assert.equal(result.caughtUp, false);
});
test("empty, completed-only, and sample-only workspaces have no daily counter", () => {
  for (const state of [
    [],
    createSampleExperiments(TODAY),
    [
      applyLifecycle(experiment("completed"), {
        type: "finish",
        completedAt: "2026-10-15T12:00:00.000Z",
      }),
    ],
  ]) {
    const result = getDailyWorkflow(state, TODAY);
    assert.equal(result.rows.length, 0);
    assert.equal(result.total, 0);
    assert.equal(result.caughtUp, false);
  }
});
test("workflow follows the user's local day across UTC boundaries and midnight", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "Pacific/Kiritimati";
    const today = localDate(new Date("2026-10-14T20:00:00Z"));
    const saved = record(experiment("local"), today);
    assert.equal(getDailyWorkflow([saved], today).checkedIn, 1);
    assert.equal(getDailyWorkflow([saved], addDays(today, 1)).checkedIn, 0);
    const nextDay = getDailyWorkflow([saved], addDays(today, 1)).rows[0];
    assert.equal(nextDay.canCheckInYesterday, true);
    assert.equal(nextDay.yesterdayEntry?.observedDate, today);
    process.env.TZ = "America/Los_Angeles";
    const westernToday = localDate(new Date("2026-10-15T01:00:00Z"));
    assert.equal(westernToday, "2026-10-14");
    const result = getDailyWorkflow([saved], westernToday);
    assert.equal(result.checkedIn, 0);
    assert.equal(result.yesterday, "2026-10-13");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
test("reload preserves caught-up state and edits do not create a duplicate date", async () => {
  const first = record(experiment("first"), TODAY),
    second = record(experiment("second"), TODAY, "not_done");
  let raw: string | null = null;
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
  const repository = createLocalStorageRepository(storage);
  await repository.load();
  await repository.save([first, second]);
  const restored = await createLocalStorageRepository(storage).load();
  assert.ok(restored);
  assert.equal(getDailyWorkflow(restored, TODAY).caughtUp, true);
  const edited = record(restored[0], TODAY, "not_done");
  assert.equal(edited.entries.length, 1);
  assert.equal(edited.entries[0].id, first.entries[0].id);
  assert.equal(edited.entries[0].recordedAt, first.entries[0].recordedAt);
  assert.ok(edited.entries[0].updatedAt);
  assert.equal(getDailyWorkflow([edited, restored[1]], TODAY).checkedIn, 2);
});
