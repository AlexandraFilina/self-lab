import assert from "node:assert/strict";
import { test } from "node:test";
import { readLocalExperiments } from "../src/features/experiments/data/local-import";
import { createSampleExperiments } from "../src/features/experiments/data/mock-experiments";
import { buildExperiment } from "../src/features/experiments/model/actions";
import { builtInMetric } from "../src/features/experiments/model/metrics";
import { LEGACY_EXPERIMENTS } from "../src/features/experiments/data/legacy-experiments";
import {
  calendarDateInZone,
  createRequestSchema,
  importRequestSchema,
} from "../src/features/experiments/model/api-contracts";
import { AppError } from "../src/lib/errors";
const user = buildExperiment(
  {
    title: "My data",
    question: "What do I observe?",
    habit: "Read",
    durationDays: 14,
    metrics: [builtInMetric("mood")],
  },
  "user-id",
  "2026-10-15",
);
test("local import reads user-origin data without writing, deleting, or rewriting the backup", () => {
  const raw = JSON.stringify({
    version: 5,
    experiments: [...createSampleExperiments("2026-10-15"), user],
  });
  let reads = 0;
  assert.deepEqual(
    readLocalExperiments({
      getItem: () => {
        reads++;
        return raw;
      },
    }),
    [user],
  );
  assert.equal(reads, 1);
});
test("absent or sample-only backups never offer a user-data import", () => {
  assert.deepEqual(readLocalExperiments({ getItem: () => null }), []);
  assert.deepEqual(
    readLocalExperiments({
      getItem: () =>
        JSON.stringify({ version: 5, experiments: createSampleExperiments("2026-10-15") }),
    }),
    [],
  );
});
test("old saved snapshots decode for import without overwriting the original raw storage", () => {
  const raw = JSON.stringify({ version: 1, experiments: LEGACY_EXPERIMENTS });
  const values = readLocalExperiments({ getItem: () => raw });
  assert.equal(values.length, LEGACY_EXPERIMENTS.length);
  assert.equal(values[0].entries[0].recordedAt, null);
  assert.equal(values[0].source, "user");
});
test("corrupt or inaccessible local storage reports an explicit safe error", () => {
  assert.throws(
    () => readLocalExperiments({ getItem: () => "invalid" }),
    (error) => error instanceof AppError && error.code === "storageCorrupt",
  );
  assert.throws(
    () =>
      readLocalExperiments({
        getItem: () => {
          throw new Error("Blocked");
        },
      }),
    (error) => error instanceof AppError && error.code === "storageRead",
  );
});
test("API boundaries reject fictional imports, invalid zones, and client-chosen lifecycle fields", () => {
  assert.equal(
    importRequestSchema.safeParse({ experiments: createSampleExperiments("2026-10-15") }).success,
    false,
  );
  assert.equal(
    createRequestSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
      draft: { ...user, status: "completed" },
      timeZone: "UTC",
    }).success,
    false,
  );
  assert.throws(() => calendarDateInZone("Invalid/Timezone", new Date()));
});
test("the server derives the user's calendar day from IANA timezone, never client UTC slicing", () => {
  const instant = new Date("2026-10-15T01:00:00Z");
  assert.equal(calendarDateInZone("America/Los_Angeles", instant), "2026-10-14");
  assert.equal(calendarDateInZone("Pacific/Kiritimati", instant), "2026-10-15");
});
