import "server-only";
import { isDeepStrictEqual } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, desc, asc } from "drizzle-orm";
import { AppError } from "@/lib/errors";
import { buildExperiment, buildDailyEntry } from "@/features/experiments/model/actions";
import { applyLifecycle } from "@/features/experiments/model/lifecycle";
import {
  createRequestSchema,
  saveEntryRequestSchema,
  lifecycleRequestSchema,
  importRequestSchema,
  publicIdSchema,
  calendarDateInZone,
} from "@/features/experiments/model/api-contracts";
import type { ExperimentsRepository } from "@/features/experiments/data/repository";
import type { DailyEntry, Experiment } from "@/features/experiments/model/types";
import type { Database } from "../db/client";
import {
  workspaces,
  experiments,
  experimentMetrics,
  dailyEntries,
  dailyEntryValues,
  targetExtensions,
  localImports,
} from "../db/schema";
import { toExperiment } from "./mapper";

type Executor = Pick<Database, "select" | "insert" | "update" | "delete">;
export async function ensureWorkspace(db: Executor, workspaceId: string) {
  await db
    .insert(workspaces)
    .values({ id: workspaceId, name: "Local development workspace" })
    .onConflictDoNothing();
}
export function createPostgresRepository(
  db: Database,
  workspaceId: string,
  now = () => new Date(),
): ExperimentsRepository {
  const matches = (publicId: string) =>
    and(eq(experiments.workspaceId, workspaceId), eq(experiments.publicId, publicId));
  async function hydrate(executor: Executor, rows: (typeof experiments.$inferSelect)[]) {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const metrics = await executor
      .select()
      .from(experimentMetrics)
      .where(inArray(experimentMetrics.experimentId, ids));
    const entries = await executor
      .select()
      .from(dailyEntries)
      .where(inArray(dailyEntries.experimentId, ids));
    const values = await executor
      .select()
      .from(dailyEntryValues)
      .where(inArray(dailyEntryValues.experimentId, ids));
    const extensions = await executor
      .select()
      .from(targetExtensions)
      .where(inArray(targetExtensions.experimentId, ids));
    return rows.map((row) => toExperiment(row, metrics, entries, values, extensions));
  }
  async function find(executor: Executor, id: string, lock = false) {
    publicIdSchema.parse(id);
    const query = executor.select().from(experiments).where(matches(id));
    const [row] = await (lock ? query.for("update") : query);
    if (!row) throw new AppError("experimentMissing");
    return { row, experiment: (await hydrate(executor, [row]))[0] };
  }
  async function insertEntry(executor: Executor, experimentId: string, entry: DailyEntry) {
    const [saved] = await executor
      .insert(dailyEntries)
      .values({
        experimentId,
        publicId: entry.id,
        observedDate: entry.observedDate,
        habitStatus: entry.habitStatus,
        note: entry.note,
        recordedAt: entry.recordedAt,
        updatedAt: entry.updatedAt,
        origin: entry.origin,
      })
      .onConflictDoUpdate({
        target: [dailyEntries.experimentId, dailyEntries.observedDate],
        set: {
          habitStatus: entry.habitStatus,
          note: entry.note,
          updatedAt: entry.updatedAt,
          origin: entry.origin,
        },
      })
      .returning();
    await executor.delete(dailyEntryValues).where(eq(dailyEntryValues.entryId, saved.id));
    const metrics = await executor
      .select()
      .from(experimentMetrics)
      .where(eq(experimentMetrics.experimentId, experimentId));
    const values = Object.entries(entry.values)
      .filter(([, value]) => value !== undefined)
      .map(([id, value]) => {
        const metric = metrics.find((metric) => metric.metricId === id);
        if (!metric || value === undefined) throw new AppError("invalidRequest");
        return { entryId: saved.id, metricId: metric.id, experimentId, value };
      });
    if (values.length) await executor.insert(dailyEntryValues).values(values);
  }
  async function insertExperiment(executor: Executor, experiment: Experiment) {
    const [row] = await executor
      .insert(experiments)
      .values({
        workspaceId,
        publicId: experiment.id,
        mode: experiment.mode,
        source: experiment.source,
        title: experiment.title,
        question: experiment.question,
        habit: experiment.habit,
        status: experiment.status,
        startDate: experiment.startDate,
        durationDays: experiment.durationDays,
        completedAt: experiment.completedAt,
        legacy: experiment.legacy ?? null,
      })
      .onConflictDoNothing({ target: [experiments.workspaceId, experiments.publicId] })
      .returning();
    if (!row) return false;
    await executor.insert(experimentMetrics).values(
      experiment.metrics.map((metric, position) => ({
        experimentId: row.id,
        metricId: metric.id,
        kind: metric.kind,
        label: metric.kind === "custom" ? metric.label : null,
        scaleKind: metric.scale.kind,
        scaleMin: metric.scale.min,
        scaleMax: metric.scale.max,
        scaleStep: metric.scale.step,
        position,
      })),
    );
    for (const entry of experiment.entries) await insertEntry(executor, row.id, entry);
    if (experiment.targetExtensions.length)
      await executor.insert(targetExtensions).values(
        experiment.targetExtensions.map((extension, position) => ({
          ...extension,
          experimentId: row.id,
          position,
        })),
      );
    return true;
  }
  function parseImport(input: readonly Experiment[]) {
    const parsed = importRequestSchema.parse({ experiments: input }).experiments;
    if (new Set(parsed.map((experiment) => experiment.id)).size !== parsed.length)
      throw new AppError("invalidRequest");
    const fingerprint = createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
    return { parsed, fingerprint };
  }
  return {
    async listExperiments() {
      return db.transaction(
        async (tx) =>
          hydrate(
            tx,
            await tx
              .select()
              .from(experiments)
              .where(eq(experiments.workspaceId, workspaceId))
              .orderBy(desc(experiments.createdAt), asc(experiments.publicId)),
          ),
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async getExperiment(id) {
      return db.transaction(async (tx) => (await find(tx, id)).experiment, {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    },
    async createExperiment(input) {
      const parsed = createRequestSchema.parse(input);
      const candidate = buildExperiment(
        parsed.draft,
        parsed.id,
        calendarDateInZone(parsed.timeZone, now()),
      );
      return db.transaction(async (tx) => {
        if (!(await insertExperiment(tx, candidate))) {
          const existing = (await find(tx, candidate.id, true)).experiment;
          const comparable = {
            ...existing,
            entries: [],
            status: "active",
            completedAt: null,
            targetExtensions: [],
          };
          if (!isDeepStrictEqual(comparable, candidate)) throw new AppError("dataConflict");
          return existing;
        }
        return (await find(tx, candidate.id)).experiment;
      });
    },
    async saveEntry(id, input) {
      const parsed = saveEntryRequestSchema.parse(input);
      return db.transaction(async (tx) => {
        const { row, experiment } = await find(tx, id, true);
        const instant = now();
        const entry = buildDailyEntry(
          experiment,
          parsed.draft,
          randomUUID(),
          parsed.observedDate,
          calendarDateInZone(parsed.timeZone, instant),
          instant.toISOString(),
        );
        await insertEntry(tx, row.id, entry);
        await tx
          .update(experiments)
          .set({ updatedAt: instant.toISOString() })
          .where(eq(experiments.id, row.id));
        return (await find(tx, id)).experiment;
      });
    },
    async changeLifecycle(id, input) {
      const parsed = lifecycleRequestSchema.parse(input);
      return db.transaction(async (tx) => {
        const { row, experiment } = await find(tx, id, true);
        const intent = parsed.intent;
        if (intent.type === "extend") {
          const [applied] = await tx
            .select()
            .from(targetExtensions)
            .where(
              and(
                eq(targetExtensions.experimentId, row.id),
                eq(targetExtensions.requestId, parsed.requestId),
              ),
            );
          if (applied) {
            if (applied.requestedDays !== intent.additionalDays) throw new AppError("dataConflict");
            return experiment;
          }
        }
        if (
          (intent.type === "finish" && experiment.status === "completed") ||
          (intent.type === "reopen" && experiment.status === "active")
        )
          return experiment;
        const instant = now();
        const command =
          intent.type === "finish"
            ? { ...intent, completedAt: instant.toISOString() }
            : intent.type === "extend"
              ? {
                  ...intent,
                  today: calendarDateInZone(parsed.timeZone, instant),
                  extendedAt: instant.toISOString(),
                }
              : intent;
        const updated = applyLifecycle(experiment, command);
        await tx
          .update(experiments)
          .set({
            status: updated.status,
            completedAt: updated.completedAt,
            durationDays: updated.durationDays,
            updatedAt: instant.toISOString(),
          })
          .where(eq(experiments.id, row.id));
        if (intent.type === "extend")
          await tx.insert(targetExtensions).values({
            ...updated.targetExtensions.at(-1)!,
            experimentId: row.id,
            position: updated.targetExtensions.length - 1,
            requestId: parsed.requestId,
            requestedDays: intent.additionalDays,
          });
        return (await find(tx, id)).experiment;
      });
    },
    async importStatus(input) {
      const { fingerprint } = parseImport(input);
      const [receipt] = await db
        .select()
        .from(localImports)
        .where(
          and(eq(localImports.workspaceId, workspaceId), eq(localImports.fingerprint, fingerprint)),
        );
      return Boolean(receipt);
    },
    async importExperiments(input) {
      const { parsed, fingerprint } = parseImport(input);
      return db.transaction(async (tx) => {
        await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId)).for("update");
        const [receipt] = await tx
          .select()
          .from(localImports)
          .where(
            and(
              eq(localImports.workspaceId, workspaceId),
              eq(localImports.fingerprint, fingerprint),
            ),
          );
        if (receipt) return { imported: 0, skipped: parsed.length };
        let imported = 0,
          skipped = 0;
        for (const experiment of parsed) {
          if (await insertExperiment(tx, experiment)) imported++;
          else {
            const existing = (await find(tx, experiment.id, true)).experiment;
            if (!isDeepStrictEqual(existing, experiment)) throw new AppError("importConflict");
            skipped++;
          }
        }
        await tx.insert(localImports).values({ workspaceId, fingerprint });
        return { imported, skipped };
      });
    },
  };
}
