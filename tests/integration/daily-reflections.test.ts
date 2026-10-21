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
  dailyReflections,
  dailyReflectionValues,
  globalMetrics,
  experiments,
  workspaces,
} from "../../src/server/db/schema";
import { builtInMetric, metricLabel } from "../../src/features/experiments/model/metrics";
import { outcomeEntries } from "../../src/features/reflections/model/analytics";
import { compareMetric } from "../../src/features/experiments/model/analytics";
import { AppError } from "../../src/lib/errors";
import { testDatabaseUrl } from "../../scripts/env";

const coded = (code: string) => (error: unknown) =>
  error instanceof AppError && error.code === code;
function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || !error) return;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error ? pgCode(error.cause) : undefined;
}

test("owned global measures and daily reflections use real PostgreSQL constraints", async (t) => {
  const { db, pool } = openDatabase(testDatabaseUrl());
  const owner = randomUUID(),
    other = randomUUID();
  await migrate(db, { migrationsFolder: "drizzle" });
  await ensureWorkspace(db, owner);
  await ensureWorkspace(db, other);
  t.after(async () => {
    for (const id of [owner, other]) {
      await db.delete(experiments).where(eq(experiments.workspaceId, id));
      await db.delete(dailyReflections).where(eq(dailyReflections.workspaceId, id));
      await db.delete(globalMetrics).where(eq(globalMetrics.workspaceId, id));
      await db.delete(workspaces).where(eq(workspaces.id, id));
    }
    await pool.end();
  });
  let now = new Date("2026-10-14T12:00:00.000Z");
  const a = createPostgresRepository(db, owner, () => now);
  const b = createPostgresRepository(db, other, () => now);
  const defaults = await a.listGlobalMetrics();
  assert.deepEqual(
    defaults.filter((item) => item.active).map((item) => item.definition.id),
    ["mood", "energy"],
  );
  assert.equal(defaults.length, 8);
  await a.changeGlobalMetric({ type: "setActive", id: "stress", active: true });
  assert.equal(
    (await a.listGlobalMetrics()).find((item) => item.definition.id === "stress")?.active,
    true,
  );
  const customId = `custom_${randomUUID()}` as const;
  await a.changeGlobalMetric({ type: "create", id: customId, label: "Уверенность в языке" });
  await assert.rejects(
    a.changeGlobalMetric({ type: "create", id: `custom_${randomUUID()}`, label: "mOoD" }),
    coded("metricDuplicate"),
  );
  await assert.rejects(
    a.changeGlobalMetric({ type: "create", id: `custom_${randomUUID()}`, label: "sleep" }),
    coded("metricDuplicate"),
  );
  await assert.rejects(
    a.changeGlobalMetric({
      type: "create",
      id: `custom_${randomUUID()}`,
      label: " уверенность В языке ",
    }),
    coded("metricDuplicate"),
  );
  await a.changeGlobalMetric({ type: "rename", id: customId, label: "Confidence" });
  assert.equal(
    (await a.listGlobalMetrics()).find((item) => item.definition.id === customId)?.definition.kind,
    "custom",
  );
  assert.equal(
    metricLabel(
      (await a.listGlobalMetrics()).find((item) => item.definition.id === customId)!.definition,
    ),
    "Confidence",
  );

  const draft = {
    title: "Walks",
    question: "How do walks relate to mood?",
    habit: "Walk",
    durationDays: 14,
    metrics: [builtInMetric("mood"), builtInMetric("energy")],
    outcomeSource: "global" as const,
  };
  const firstId = randomUUID(),
    secondId = randomUUID();
  const first = await a.createExperiment({ id: firstId, draft, timeZone: "UTC" });
  await a.createExperiment({
    id: secondId,
    draft: { ...draft, title: "Reading" },
    timeZone: "UTC",
  });
  assert.equal(first.outcomeSource, "global");
  assert.deepEqual(await a.listReflections(), []);
  const firstReflection = await a.saveReflection({
    observedDate: "2026-10-14",
    timeZone: "UTC",
    draft: { values: { mood: 8, energy: 6, [customId]: 7 }, note: "A calm day" },
  });
  assert.equal(firstReflection.updatedAt, null);
  assert.equal((await a.listReflections()).length, 1);
  await assert.rejects(
    db.insert(dailyReflections).values({ workspaceId: owner, observedDate: "2026-10-14" }),
    (error: unknown) => pgCode(error) === "23505",
  );
  const [customRow] = await db
    .select()
    .from(globalMetrics)
    .where(eq(globalMetrics.metricId, customId));
  await assert.rejects(
    db.delete(globalMetrics).where(eq(globalMetrics.id, customRow.id)),
    (error: unknown) => pgCode(error) === "23503",
  );
  await a.changeGlobalMetric({ type: "setActive", id: customId, active: false });
  assert.equal(
    (await a.listGlobalMetrics()).find((item) => item.definition.id === customId)?.active,
    false,
  );
  assert.equal((await a.listReflections())[0].values[customId], 7);

  await a.saveEntry(firstId, {
    observedDate: "2026-10-14",
    timeZone: "UTC",
    draft: { habitStatus: "done", values: {} },
  });
  await a.saveEntry(secondId, {
    observedDate: "2026-10-14",
    timeZone: "UTC",
    draft: { habitStatus: "not_done", values: {} },
  });
  await assert.rejects(
    a.saveEntry(firstId, {
      observedDate: "2026-10-14",
      timeZone: "UTC",
      draft: { habitStatus: "done", values: { mood: 8 } },
    }),
    (error: unknown) => Boolean(error),
  );
  assert.equal(
    compareMetric(outcomeEntries(await a.getExperiment(firstId), await a.listReflections()), "mood")
      .done.average,
    8,
  );
  assert.equal(
    compareMetric(
      outcomeEntries(await a.getExperiment(secondId), await a.listReflections()),
      "mood",
    ).notDone.average,
    8,
  );

  now = new Date("2026-10-15T12:00:00.000Z");
  await a.saveEntry(firstId, {
    observedDate: "2026-10-15",
    timeZone: "UTC",
    draft: { habitStatus: "not_done", values: {} },
  });
  assert.equal(
    compareMetric(outcomeEntries(await a.getExperiment(firstId), await a.listReflections()), "mood")
      .notDone.count,
    0,
  );
  const edited = await a.saveReflection({
    observedDate: "2026-10-14",
    timeZone: "UTC",
    draft: { values: { mood: 5, energy: 4, [customId]: 7 }, note: "Edited" },
  });
  assert.equal(edited.id, firstReflection.id);
  assert.equal(edited.recordedAt, firstReflection.recordedAt);
  assert.ok(edited.updatedAt);
  assert.equal((await a.listReflections()).length, 1);
  assert.equal(
    compareMetric(
      outcomeEntries(await a.getExperiment(secondId), await a.listReflections()),
      "mood",
    ).notDone.average,
    5,
  );
  await a.saveReflection({
    observedDate: "2026-10-15",
    timeZone: "UTC",
    draft: { values: { mood: 3 } },
  });
  assert.equal(
    compareMetric(outcomeEntries(await a.getExperiment(firstId), await a.listReflections()), "mood")
      .notDone.average,
    3,
  );

  assert.deepEqual(await b.listReflections(), []);
  await assert.rejects(
    b.changeGlobalMetric({ type: "rename", id: customId, label: "Stolen" }),
    coded("invalidRequest"),
  );
  await assert.rejects(
    b.saveReflection({
      observedDate: "2026-10-15",
      timeZone: "UTC",
      draft: { values: { [customId]: 7 } },
    }),
    coded("invalidRequest"),
  );
  const otherReflection = await b.saveReflection({
    observedDate: "2026-10-15",
    timeZone: "UTC",
    draft: { values: { mood: 7 } },
  });
  const [otherRow] = await db
    .select()
    .from(dailyReflections)
    .where(eq(dailyReflections.id, otherReflection.id));
  await assert.rejects(
    db
      .insert(dailyReflectionValues)
      .values({ reflectionId: otherRow.id, metricId: customRow.id, workspaceId: other, value: 7 }),
    (error: unknown) => pgCode(error) === "23503",
  );
});
