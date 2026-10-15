import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../src/lib/errors";
import { addDays } from "../src/lib/dates";
import {
  buildDailyEntry,
  buildExperiment,
  experimentsReducer,
} from "../src/features/experiments/model/actions";
import { applyLifecycle, extendedDuration } from "../src/features/experiments/model/lifecycle";
import {
  compareMetric,
  getProgress,
  observedWindowDays,
} from "../src/features/experiments/model/analytics";
import { builtInMetric } from "../src/features/experiments/model/metrics";
import {
  createCompletedSampleExperiment,
  ensureCompletedSample,
} from "../src/features/experiments/data/mock-experiments";
import { adaptLegacyExperiment, decodeWorkspace } from "../src/features/experiments/data/migration";
import { LEGACY_EXPERIMENTS } from "../src/features/experiments/data/legacy-experiments";
import {
  createLocalStorageRepository,
  STORAGE_KEY,
  type StoragePort,
} from "../src/features/experiments/data/local-storage-repository";
import { experimentSchema } from "../src/features/experiments/model/schemas";
import { versionFourExperiment } from "./storage-fixtures";

const TODAY = "2026-10-15";
const SAVED_AT = "2026-10-15T12:00:00.000Z";
const experiment = buildExperiment(
  {
    title: "Daily walks",
    question: "How do I feel on walking days?",
    habit: "Walk before work",
    durationDays: 21,
    metrics: [builtInMetric("mood")],
  },
  "user-experiment",
  TODAY,
);
const entry = buildDailyEntry(
  experiment,
  { habitStatus: "done", values: { mood: 7 }, note: "A quiet day" },
  "entry-1",
  TODAY,
  TODAY,
  SAVED_AT,
);
const recorded = { ...experiment, entries: [entry] };
const code = (expected: string) => (error: unknown) =>
  error instanceof AppError && error.code === expected;
function memoryStorage(raw: string | null = null): StoragePort {
  return {
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
    },
  };
}

test("reaching or passing the observation target never automatically completes an experiment", () => {
  for (const day of [21, 22, 90]) {
    const progress = getProgress(recorded, addDays(TODAY, day));
    assert.equal(progress.completed, false);
    assert.equal(progress.windowComplete, true);
    assert.equal(recorded.status, "active");
    assert.equal(recorded.completedAt, null);
  }
});
test("Finish explicitly completes the existing experiment with a timestamp and unchanged observations", () => {
  const before = structuredClone(recorded);
  const finished = applyLifecycle(recorded, { type: "finish", completedAt: SAVED_AT });
  assert.equal(finished.id, recorded.id);
  assert.equal(finished.status, "completed");
  assert.equal(finished.completedAt, SAVED_AT);
  assert.deepEqual(finished.entries, recorded.entries);
  assert.deepEqual(recorded, before);
  assert.equal(getProgress(finished, TODAY).completed, true);
});
test("the state update moves completed experiments out of Active without creating a copy", () => {
  const finished = applyLifecycle(recorded, { type: "finish", completedAt: SAVED_AT });
  const second = { ...experiment, id: "other" };
  const state = experimentsReducer([recorded, second], {
    type: "experimentUpdated",
    experiment: finished,
  });
  assert.equal(state.length, 2);
  assert.deepEqual(
    state.filter((item) => item.status === "active").map((item) => item.id),
    ["other"],
  );
  assert.deepEqual(
    state.filter((item) => item.status === "completed").map((item) => item.id),
    [recorded.id],
  );
});
test("early Finish works with one observation and honest insufficient results", () => {
  const finished = applyLifecycle(recorded, { type: "finish", completedAt: SAVED_AT });
  assert.equal(getProgress(finished, TODAY).windowComplete, false);
  assert.equal(finished.status, "completed");
  assert.equal(compareMetric(finished.entries, "mood").conclusion, "insufficient");
  assert.equal(compareMetric(finished.entries, "mood").relativeDifference, null);
  const empty = applyLifecycle(experiment, { type: "finish", completedAt: SAVED_AT });
  assert.equal(empty.status, "completed");
});
test("an early finish does not count unelapsed future target days as missing observations", () => {
  const finished = applyLifecycle(recorded, { type: "finish", completedAt: SAVED_AT });
  assert.equal(observedWindowDays(finished), 1);
  assert.equal(observedWindowDays(finished) - finished.entries.length, 0);
  assert.equal(observedWindowDays(createCompletedSampleExperiment(TODAY)), 28);
});
test("Keep observing supports 7, 14, and custom days and preserves every old observation", () => {
  for (const days of [7, 14, 3]) {
    const next = applyLifecycle(recorded, {
      type: "extend",
      additionalDays: days,
      today: addDays(TODAY, 21),
      extendedAt: SAVED_AT,
    });
    assert.equal(next.durationDays, 21 + days);
    assert.equal(next.status, "active");
    assert.equal(next.startDate, recorded.startDate);
    assert.deepEqual(next.entries, recorded.entries);
    assert.deepEqual(next.targetExtensions, [
      { previousDurationDays: 21, durationDays: 21 + days, extendedAt: SAVED_AT },
    ]);
  }
  assert.equal(recorded.durationDays, 21);
  assert.deepEqual(recorded.targetExtensions, []);
});
test("late extensions include today and preserve sequential target history", () => {
  const extended = applyLifecycle(recorded, {
    type: "extend",
    additionalDays: 7,
    today: addDays(TODAY, 40),
    extendedAt: SAVED_AT,
  });
  assert.equal(extended.durationDays, 47);
  assert.equal(getProgress(extended, addDays(TODAY, 40)).windowComplete, false);
  const again = applyLifecycle(extended, {
    type: "extend",
    additionalDays: 14,
    today: addDays(TODAY, 47),
    extendedAt: SAVED_AT,
  });
  assert.equal(again.durationDays, 61);
  assert.deepEqual(
    again.targetExtensions.map((item) => item.previousDurationDays),
    [21, 47],
  );
  assert.deepEqual(again.entries, recorded.entries);
});
test("invalid extensions and inconsistent lifecycle snapshots are rejected", () => {
  for (const days of [0, -1, 1.5, NaN, Infinity, 365])
    assert.throws(() => extendedDuration(recorded, days, TODAY), code("invalidExtension"));
  assert.equal(experimentSchema.safeParse({ ...recorded, completedAt: SAVED_AT }).success, false);
  assert.equal(
    experimentSchema.safeParse({
      ...recorded,
      durationDays: 28,
      targetExtensions: [{ previousDurationDays: 30, durationDays: 28, extendedAt: SAVED_AT }],
    }).success,
    false,
  );
  assert.equal(
    experimentSchema.safeParse({
      ...recorded,
      durationDays: 28,
      targetExtensions: [{ previousDurationDays: 21, durationDays: 27, extendedAt: SAVED_AT }],
    }).success,
    false,
  );
});
test("Reopen preserves IDs, metrics, observations, analytics, and target history", () => {
  const extended = applyLifecycle(recorded, {
    type: "extend",
    additionalDays: 7,
    today: TODAY,
    extendedAt: SAVED_AT,
  });
  const finished = applyLifecycle(extended, { type: "finish", completedAt: SAVED_AT });
  const reopened = applyLifecycle(finished, { type: "reopen" });
  assert.equal(reopened.id, recorded.id);
  assert.equal(reopened.status, "active");
  assert.equal(reopened.completedAt, null);
  assert.deepEqual(reopened.entries, finished.entries);
  assert.deepEqual(reopened.metrics, finished.metrics);
  assert.deepEqual(reopened.targetExtensions, finished.targetExtensions);
  assert.deepEqual(
    compareMetric(reopened.entries, "mood"),
    compareMetric(finished.entries, "mood"),
  );
});
test("completed experiments permit saved-date edits but require Reopen for new entries", () => {
  const finished = applyLifecycle(recorded, { type: "finish", completedAt: SAVED_AT });
  assert.throws(
    () =>
      buildDailyEntry(
        finished,
        { habitStatus: "done", values: {} },
        "new",
        addDays(TODAY, 1),
        addDays(TODAY, 1),
      ),
    code("completedEntry"),
  );
  const edit = buildDailyEntry(
    finished,
    { habitStatus: "not_done", values: { mood: 5 } },
    "edit",
    TODAY,
    TODAY,
  );
  assert.equal(edit.id, entry.id);
  assert.equal(edit.recordedAt, entry.recordedAt);
  assert.equal(edit.habitStatus, "not_done");
  const reopened = applyLifecycle(finished, { type: "reopen" });
  assert.equal(
    buildDailyEntry(
      reopened,
      { habitStatus: "done", values: {} },
      "new",
      addDays(TODAY, 1),
      addDays(TODAY, 1),
    ).observedDate,
    addDays(TODAY, 1),
  );
});
test("invalid or repeated transitions are rejected rather than silently duplicating work", () => {
  const finished = applyLifecycle(recorded, { type: "finish", completedAt: SAVED_AT });
  assert.throws(
    () => applyLifecycle(finished, { type: "finish", completedAt: SAVED_AT }),
    code("lifecycleState"),
  );
  assert.throws(() => applyLifecycle(recorded, { type: "reopen" }), code("lifecycleState"));
  assert.throws(
    () =>
      applyLifecycle(finished, {
        type: "extend",
        additionalDays: 7,
        today: TODAY,
        extendedAt: SAVED_AT,
      }),
    code("lifecycleState"),
  );
});
test("lifecycle and extension history survive repository reload and failed writes keep the old snapshot", async () => {
  const storage = memoryStorage();
  const repository = createLocalStorageRepository(storage);
  await repository.load();
  const extended = applyLifecycle(recorded, {
    type: "extend",
    additionalDays: 7,
    today: TODAY,
    extendedAt: SAVED_AT,
  });
  const finished = applyLifecycle(extended, { type: "finish", completedAt: SAVED_AT });
  await repository.save([finished]);
  const restored = await createLocalStorageRepository(storage).load();
  assert.deepEqual(restored, [finished]);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}").version, 5);
  const originalWrite = storage.setItem;
  storage.setItem = () => {
    throw new Error("Write failed");
  };
  await assert.rejects(
    repository.save([applyLifecycle(finished, { type: "reopen" })]),
    code("storageWrite"),
  );
  assert.deepEqual(await createLocalStorageRepository(storage).load(), [finished]);
  storage.setItem = originalWrite;
  await repository.save([applyLifecycle(finished, { type: "reopen" })]);
  assert.equal((await createLocalStorageRepository(storage).load())?.[0].status, "active");
});
test("version-four migration preserves user data and assigns lifecycle without inferring completion from dates", async () => {
  const sample = createCompletedSampleExperiment(TODAY);
  const userWithSampleId = {
    ...recorded,
    id: "morning-walk",
    startDate: "2020-01-01",
    entries: [],
  };
  const previous = [
    versionFourExperiment(recorded),
    versionFourExperiment(sample),
    versionFourExperiment(userWithSampleId),
  ];
  const storage = memoryStorage(JSON.stringify({ version: 4, experiments: previous }));
  const migrated = await createLocalStorageRepository(storage).load();
  assert.ok(migrated);
  assert.equal(migrated[0].status, "active");
  assert.equal(migrated[1].status, "completed");
  assert.equal(migrated[2].status, "active");
  assert.ok(migrated.every((item) => item.completedAt === null));
  assert.deepEqual(migrated.map(versionFourExperiment), previous);
  assert.deepEqual(await createLocalStorageRepository(storage).load(), migrated);
});
test("sample cleanup after migration retains matching user IDs and stays stable across saves and reloads", async () => {
  const old = adaptLegacyExperiment(LEGACY_EXPERIMENTS[2], "sample");
  const user = { ...recorded, id: "early-sleep", title: old.title };
  const raw = JSON.stringify({ version: 4, experiments: [old, user].map(versionFourExperiment) });
  const migrated = decodeWorkspace(raw).experiments;
  const cleaned = ensureCompletedSample(migrated, TODAY);
  assert.equal(cleaned.length, 2);
  assert.equal(cleaned.filter((item) => item.source === "sample").length, 1);
  assert.equal(cleaned.find((item) => item.source === "user")?.id, user.id);
  const storage = memoryStorage(raw);
  const repository = createLocalStorageRepository(storage);
  await repository.load();
  await repository.save(cleaned);
  const restored = await createLocalStorageRepository(storage).load();
  assert.ok(restored);
  assert.deepEqual(ensureCompletedSample(restored, TODAY), cleaned);
});
