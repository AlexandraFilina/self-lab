import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { openDatabase } from "../../src/server/db/client";
import {
  createPostgresRepository,
  ensureWorkspace,
} from "../../src/server/experiments/postgres-repository";
import {
  experiments,
  dailyEntries,
  dailyEntryValues,
  localImports,
  workspaces,
} from "../../src/server/db/schema";
import { builtInMetric } from "../../src/features/experiments/model/metrics";
import { buildCustomMetric, buildExperiment } from "../../src/features/experiments/model/actions";
import { createSampleExperiments } from "../../src/features/experiments/data/mock-experiments";
import { adaptLegacyExperiment } from "../../src/features/experiments/data/migration";
import { LEGACY_EXPERIMENTS } from "../../src/features/experiments/data/legacy-experiments";
import { AppError } from "../../src/lib/errors";
import { testDatabaseUrl } from "../../scripts/env";

const coded = (code: string) => (error: unknown) =>
  error instanceof AppError && error.code === code;
function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || !error) return;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error ? pgCode(error.cause) : undefined;
}

test("PostgreSQL repository uses a real isolated test workspace", async (t) => {
  const { db, pool } = openDatabase(testDatabaseUrl());
  const workspaceId = randomUUID(),
    otherWorkspace = randomUUID();
  t.after(async () => {
    for (const id of [workspaceId, otherWorkspace]) {
      await db.delete(experiments).where(eq(experiments.workspaceId, id));
      await db.delete(localImports).where(eq(localImports.workspaceId, id));
      await db.delete(workspaces).where(eq(workspaces.id, id));
    }
    await pool.end();
  });
  await migrate(db, { migrationsFolder: "drizzle" });
  await ensureWorkspace(db, workspaceId);
  await ensureWorkspace(db, otherWorkspace);
  let instant = new Date("2026-10-14T12:00:00.000Z");
  const repository = createPostgresRepository(db, workspaceId, () => instant);
  const custom = buildCustomMetric("Focus", randomUUID());
  const draft = {
    title: "Walks'); DROP TABLE experiments; --",
    question: "How do walks relate to focus?",
    habit: "Walk before work",
    durationDays: 21,
    metrics: [builtInMetric("mood"), builtInMetric("energy"), custom],
  };
  const id = randomUUID();
  await t.test(
    "create/get/list keeps SQL-like text as data and persists custom definitions",
    async () => {
      const saved = await repository.createExperiment({ id, draft, timeZone: "UTC" });
      assert.equal(saved.title, draft.title);
      assert.deepEqual(saved.metrics, draft.metrics);
      assert.equal(saved.startDate, "2026-10-14");
      assert.equal(saved.entries.length, 0);
      assert.deepEqual(await repository.getExperiment(id), saved);
      assert.equal((await repository.listExperiments()).length, 1);
    },
  );
  await t.test(
    "creation retry is idempotent and rejects a changed request with the same ID",
    async () => {
      await repository.createExperiment({ id, draft, timeZone: "UTC" });
      assert.equal((await repository.listExperiments()).length, 1);
      await assert.rejects(
        repository.createExperiment({ id, draft: { ...draft, title: "Changed" }, timeZone: "UTC" }),
        coded("dataConflict"),
      );
    },
  );
  await t.test("workspace scope cannot get or mutate another workspace's experiment", async () => {
    const other = createPostgresRepository(db, otherWorkspace, () => instant);
    assert.deepEqual(await other.listExperiments(), []);
    await assert.rejects(other.getExperiment(id), coded("experimentMissing"));
    await assert.rejects(
      other.saveEntry(id, {
        observedDate: "2026-10-14",
        draft: { habitStatus: "done", values: {} },
        timeZone: "UTC",
      }),
      coded("experimentMissing"),
    );
  });
  instant = new Date("2026-10-15T12:00:00.000Z");
  await t.test(
    "Done/custom values and missing scores survive a fresh repository query",
    async () => {
      await repository.saveEntry(id, {
        observedDate: "2026-10-15",
        draft: { habitStatus: "done", values: { mood: 8, [custom.id]: 6 }, note: "Observed" },
        timeZone: "UTC",
      });
      const saved = await createPostgresRepository(db, workspaceId).getExperiment(id);
      assert.equal(saved.entries[0].habitStatus, "done");
      assert.equal(saved.entries[0].values[custom.id], 6);
      assert.equal(saved.entries[0].values.energy, undefined);
      assert.equal(saved.entries[0].observedDate, "2026-10-15");
      assert.equal(saved.entries[0].recordedAt, instant.toISOString());
      assert.equal(saved.entries[0].updatedAt, null);
    },
  );
  await t.test("Not done yesterday is a real independent observation", async () => {
    const saved = await repository.saveEntry(id, {
      observedDate: "2026-10-14",
      draft: { habitStatus: "not_done", values: { mood: 5 } },
      timeZone: "UTC",
    });
    assert.equal(saved.entries.length, 2);
    assert.equal(saved.entries[0].habitStatus, "not_done");
  });
  await t.test(
    "editing the same date preserves ID/recordedAt and clears omitted scores",
    async () => {
      const before = (await repository.getExperiment(id)).entries[1];
      instant = new Date("2026-10-15T12:00:01.000Z");
      const saved = await repository.saveEntry(id, {
        observedDate: "2026-10-15",
        draft: { habitStatus: "not_done", values: { [custom.id]: 7 }, note: "Edited" },
        timeZone: "UTC",
      });
      assert.equal(saved.entries.length, 2);
      assert.equal(saved.entries[1].id, before.id);
      assert.equal(saved.entries[1].recordedAt, before.recordedAt);
      assert.equal(saved.entries[1].updatedAt, instant.toISOString());
      assert.deepEqual(saved.entries[1].values, { [custom.id]: 7 });
    },
  );
  await t.test(
    "UNIQUE(experiment_id, observed_date) physically rejects a duplicate SQL insert",
    async () => {
      const [parent] = await db.select().from(experiments).where(eq(experiments.publicId, id));
      const [entry] = await db
        .select()
        .from(dailyEntries)
        .where(eq(dailyEntries.experimentId, parent.id));
      await assert.rejects(
        db.insert(dailyEntries).values({ ...entry, id: randomUUID(), publicId: randomUUID() }),
        (error) => pgCode(error) === "23505",
      );
    },
  );
  await t.test(
    "concurrent same-date saves serialize without duplicate entries or score rows",
    async () => {
      await Promise.all(
        [7, 8].map((score) =>
          repository.saveEntry(id, {
            observedDate: "2026-10-15",
            draft: { habitStatus: "done", values: { [custom.id]: score } },
            timeZone: "UTC",
          }),
        ),
      );
      const saved = await repository.getExperiment(id);
      assert.equal(saved.entries.length, 2);
      assert.equal(saved.entries.filter((entry) => entry.observedDate === "2026-10-15").length, 1);
    },
  );
  await t.test("server-side local calendar dates reject future and old new entries", async () => {
    await assert.rejects(
      repository.saveEntry(id, {
        observedDate: "2026-10-16",
        draft: { habitStatus: "done", values: {} },
        timeZone: "UTC",
      }),
      coded("futureEntry"),
    );
    instant = new Date("2026-10-20T12:00:00.000Z");
    await assert.rejects(
      repository.saveEntry(id, {
        observedDate: "2026-10-17",
        draft: { habitStatus: "done", values: {} },
        timeZone: "UTC",
      }),
      coded("recentEntryOnly"),
    );
    instant = new Date("2026-10-15T12:00:02.000Z");
  });
  await t.test(
    "Finish and Reopen persist explicit lifecycle with unchanged observations",
    async () => {
      const before = await repository.getExperiment(id);
      const finished = await repository.changeLifecycle(id, {
        intent: { type: "finish" },
        timeZone: "UTC",
        requestId: randomUUID(),
      });
      assert.equal(finished.status, "completed");
      assert.equal(finished.completedAt, instant.toISOString());
      assert.deepEqual(finished.entries, before.entries);
      const repeated = await repository.changeLifecycle(id, {
        intent: { type: "finish" },
        timeZone: "UTC",
        requestId: randomUUID(),
      });
      assert.equal(repeated.completedAt, finished.completedAt);
      const reopened = await repository.changeLifecycle(id, {
        intent: { type: "reopen" },
        timeZone: "UTC",
        requestId: randomUUID(),
      });
      assert.equal(reopened.completedAt, null);
      assert.equal(reopened.status, "active");
      assert.deepEqual(reopened.entries, before.entries);
    },
  );
  await t.test(
    "target extension persists history and request ID prevents a double extension",
    async () => {
      const requestId = randomUUID();
      const input = {
        intent: { type: "extend" as const, additionalDays: 7 },
        timeZone: "UTC",
        requestId,
      };
      const extended = await repository.changeLifecycle(id, input);
      assert.equal(extended.durationDays, 28);
      assert.equal(extended.targetExtensions.length, 1);
      assert.deepEqual(await repository.changeLifecycle(id, input), extended);
      await assert.rejects(
        repository.changeLifecycle(id, {
          ...input,
          intent: { type: "extend", additionalDays: 14 },
        }),
        coded("dataConflict"),
      );
    },
  );
  await t.test(
    "failure during score insertion rolls back entry changes and score deletion",
    async () => {
      const before = await repository.getExperiment(id);
      const [parent] = await db.select().from(experiments).where(eq(experiments.publicId, id));
      const suffix = randomUUID().replaceAll("-", "");
      const fn = `fail_score_${suffix}`,
        trigger = `fail_score_trigger_${suffix}`;
      await pool.query(
        `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.experiment_id = '${parent.id}'::uuid AND NEW.numeric_value = 9 THEN RAISE EXCEPTION 'Test rollback'; END IF; RETURN NEW; END $$`,
      );
      await pool.query(
        `CREATE TRIGGER ${trigger} BEFORE INSERT ON daily_entry_values FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
      );
      try {
        await assert.rejects(
          repository.saveEntry(id, {
            observedDate: "2026-10-15",
            draft: { habitStatus: "not_done", values: { [custom.id]: 9 }, note: "Must roll back" },
            timeZone: "UTC",
          }),
        );
        assert.deepEqual(await repository.getExperiment(id), before);
      } finally {
        await pool.query(`DROP TRIGGER ${trigger} ON daily_entry_values`);
        await pool.query(`DROP FUNCTION ${fn}()`);
      }
    },
  );
  const imported = buildExperiment(
    { ...draft, title: "Imported" },
    `legacy-user-${randomUUID()}`,
    "2026-10-01",
  );
  imported.status = "completed";
  imported.completedAt = "2026-10-10T12:00:00.123456Z";
  imported.entries = [
    {
      id: "original-entry",
      observedDate: "2026-10-02",
      habitStatus: "done",
      recordedAt: "2026-10-02T12:00:00.000Z",
      updatedAt: null,
      note: "Keep this",
      origin: "check_in",
      values: { [custom.id]: 7 },
    },
  ];
  await t.test(
    "explicit import preserves IDs, custom metrics, timestamps, and lifecycle",
    async () => {
      assert.equal(await repository.importStatus([imported]), false);
      assert.deepEqual(await repository.importExperiments([imported]), { imported: 1, skipped: 0 });
      assert.deepEqual(await repository.getExperiment(imported.id), imported);
      assert.equal(await repository.importStatus([imported]), true);
      assert.deepEqual(await repository.importExperiments([imported]), { imported: 0, skipped: 1 });
    },
  );
  await t.test(
    "an import receipt prevents stale local backup from overwriting later server changes",
    async () => {
      await repository.changeLifecycle(imported.id, {
        intent: { type: "reopen" },
        timeZone: "UTC",
        requestId: randomUUID(),
      });
      const edited = await repository.saveEntry(imported.id, {
        observedDate: "2026-10-02",
        draft: { habitStatus: "not_done", values: { [custom.id]: 4 } },
        timeZone: "UTC",
      });
      await repository.importExperiments([imported]);
      assert.deepEqual(await repository.getExperiment(imported.id), edited);
    },
  );
  await t.test(
    "conflicting import rolls back the entire batch without overwriting saved data",
    async () => {
      const first = { ...imported, id: `new-${randomUUID()}` };
      const conflicting = { ...imported, title: "A different import" };
      await assert.rejects(
        repository.importExperiments([first, conflicting]),
        coded("importConflict"),
      );
      await assert.rejects(repository.getExperiment(first.id), coded("experimentMissing"));
      assert.equal(await repository.importStatus([first, conflicting]), false);
    },
  );
  await t.test(
    "fictional samples are rejected and legacy user archives remain importable",
    async () => {
      await assert.rejects(repository.importExperiments(createSampleExperiments("2026-10-15")));
      const legacyUser = adaptLegacyExperiment(LEGACY_EXPERIMENTS[2], "user");
      await repository.importExperiments([legacyUser]);
      assert.deepEqual(await repository.getExperiment(legacyUser.id), legacyUser);
    },
  );
  await t.test("foreign keys reject a score attached to another experiment's metric", async () => {
    const [entry] = await db
      .select()
      .from(dailyEntries)
      .innerJoin(experiments, eq(experiments.id, dailyEntries.experimentId))
      .where(eq(experiments.publicId, id));
    await assert.rejects(
      db.insert(dailyEntryValues).values({
        entryId: entry.daily_entries.id,
        experimentId: entry.daily_entries.experimentId,
        metricId: randomUUID(),
        value: 6,
      }),
      (error) => pgCode(error) === "23503",
    );
  });
});
