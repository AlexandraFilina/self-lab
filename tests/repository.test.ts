import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../src/lib/errors";
import {
  buildExperiment,
  buildDailyEntry,
  experimentsReducer,
} from "../src/features/experiments/model/actions";
import {
  createLocalStorageRepository,
  STORAGE_KEY,
  type StoragePort,
} from "../src/features/experiments/data/local-storage-repository";
import { LEGACY_EXPERIMENTS } from "../src/features/experiments/data/legacy-experiments";

class MemoryStorage implements StoragePort {
  values = new Map<string, string>();
  failRead = false;
  failWrite = false;
  getItem(key: string) {
    if (this.failRead) throw new Error("Read blocked");
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrite) throw new Error("Quota exceeded");
    this.values.set(key, value);
  }
}
const TODAY = "2026-10-14";
const experiment = buildExperiment(
  {
    title: "Morning walk",
    question: "Does a walk relate to mood?",
    habit: "Walk for 20 minutes",
    durationDays: 14,
    metrics: ["mood"],
  },
  "experiment",
  TODAY,
);
const code = (value: string) => (error: unknown) =>
  error instanceof AppError && error.code === value;

test("new repositories report absent data without manufacturing observations", async () => {
  const repository = createLocalStorageRepository(new MemoryStorage());
  assert.equal(await repository.load(), null);
});
test("two created experiments and check-ins survive a repository reload", async () => {
  const storage = new MemoryStorage(),
    repository = createLocalStorageRepository(storage);
  await repository.load();
  const second = { ...experiment, id: "second", title: "A second experiment" };
  const entry = buildDailyEntry(
    experiment,
    { habitStatus: "done", values: { mood: 8 } },
    "entry",
    TODAY,
    TODAY,
  );
  const state = experimentsReducer([experiment, second], {
    type: "entrySaved",
    experimentId: experiment.id,
    entry,
  });
  await repository.save(state);
  const reloaded = await createLocalStorageRepository(storage).load();
  assert.deepEqual(reloaded, state);
  assert.equal(reloaded?.length, 2);
  assert.equal(reloaded?.[0].entries[0].habitStatus, "done");
});
test("editing a persisted date never creates a duplicate after reload", async () => {
  const storage = new MemoryStorage(),
    repository = createLocalStorageRepository(storage);
  await repository.load();
  const first = buildDailyEntry(
    experiment,
    { habitStatus: "done", values: { mood: 8 } },
    "first",
    TODAY,
    TODAY,
  );
  const state = experimentsReducer([experiment], {
    type: "entrySaved",
    experimentId: experiment.id,
    entry: first,
  });
  await repository.save(state);
  const edit = buildDailyEntry(
    state[0],
    { habitStatus: "not_done", values: {}, note: "Updated" },
    "second",
    TODAY,
    TODAY,
  );
  await repository.save(
    experimentsReducer(state, { type: "entrySaved", experimentId: experiment.id, entry: edit }),
  );
  const restored = await createLocalStorageRepository(storage).load();
  assert.equal(restored?.[0].entries.length, 1);
  assert.equal(restored?.[0].entries[0].id, "first");
  assert.equal(restored?.[0].entries[0].habitStatus, "not_done");
  assert.deepEqual(restored?.[0].entries[0].values, {});
});
test("failed writes preserve the previous snapshot and can be retried", async () => {
  const storage = new MemoryStorage(),
    repository = createLocalStorageRepository(storage);
  await repository.load();
  await repository.save([experiment]);
  const previous = storage.getItem(STORAGE_KEY);
  storage.failWrite = true;
  await assert.rejects(
    repository.save([{ ...experiment, title: "Changed" }]),
    code("storageWrite"),
  );
  assert.equal(storage.getItem(STORAGE_KEY), previous);
  storage.failWrite = false;
  await repository.save([{ ...experiment, title: "Changed" }]);
  assert.equal((await repository.load())?.[0].title, "Changed");
});
test("corrupt or unsupported stored data are not overwritten", async () => {
  for (const raw of [
    "broken JSON",
    JSON.stringify({ version: 99, experiments: [] }),
    JSON.stringify({ version: 2, experiments: [experiment, { ...experiment }] }),
  ]) {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, raw);
    const repository = createLocalStorageRepository(storage);
    await assert.rejects(repository.load(), (error) => error instanceof AppError);
    await assert.rejects(repository.save([]), code("loading"));
    assert.equal(storage.getItem(STORAGE_KEY), raw);
  }
});
test("duplicate experiment/date pairs are rejected at the persistence boundary", async () => {
  const storage = new MemoryStorage(),
    repository = createLocalStorageRepository(storage);
  await repository.load();
  const entry = buildDailyEntry(
    experiment,
    { habitStatus: "done", values: {} },
    "entry",
    TODAY,
    TODAY,
  );
  await assert.rejects(
    repository.save([{ ...experiment, entries: [entry, { ...entry, id: "duplicate" }] }]),
    code("storageCorrupt"),
  );
  assert.equal(storage.getItem(STORAGE_KEY), null);
});
test("legacy snapshots migrate without losing scores, notes, conditions, or dates", async () => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, experiments: LEGACY_EXPERIMENTS }));
  const migrated = await createLocalStorageRepository(storage).load();
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}").version, 3);
  assert.deepEqual(migrated?.[0].legacy, LEGACY_EXPERIMENTS[0]);
  assert.ok(migrated?.[0].entries.every((entry) => entry.habitStatus === null));
});
test("another tab's newer snapshot is never silently replaced", async () => {
  const storage = new MemoryStorage(),
    first = createLocalStorageRepository(storage),
    second = createLocalStorageRepository(storage);
  await first.load();
  await second.load();
  await first.save([experiment]);
  await assert.rejects(second.save([]), code("staleStorage"));
  assert.equal((await second.load())?.length, 1);
});
test("storage access failures are explicit", async () => {
  const storage = new MemoryStorage();
  storage.failRead = true;
  await assert.rejects(createLocalStorageRepository(storage).load(), code("storageRead"));
});

test("version-two observations migrate to observedDate without inventing save timestamps", async () => {
  const storage = new MemoryStorage();
  const previousEntry = {
    id: "old-entry",
    date: TODAY,
    habitStatus: "done",
    values: { mood: 8 },
    note: "Preserve this note",
    origin: "check_in",
  };
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 2, experiments: [{ ...experiment, entries: [previousEntry] }] }),
  );
  const repository = createLocalStorageRepository(storage);
  const migrated = await repository.load();
  const saved = migrated?.[0].entries[0];
  assert.ok(saved);
  assert.deepEqual(saved, {
    id: previousEntry.id,
    observedDate: TODAY,
    habitStatus: "done",
    values: { mood: 8 },
    note: previousEntry.note,
    origin: "check_in",
    recordedAt: null,
    updatedAt: null,
  });
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}").version, 3);
  assert.deepEqual(await createLocalStorageRepository(storage).load(), migrated);
  const edit = buildDailyEntry(
    migrated[0],
    { habitStatus: "not_done", values: {} },
    "new-id",
    TODAY,
    TODAY,
    "2026-10-14T20:00:00.000Z",
  );
  assert.equal(edit.recordedAt, null);
  assert.equal(edit.updatedAt, "2026-10-14T20:00:00.000Z");
});
