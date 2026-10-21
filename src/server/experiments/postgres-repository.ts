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
import { DEFAULT_NUMERIC_SCALE } from "@/features/experiments/model/types";
import {
  builtInMetric,
  metricLabel,
  normalizeMetricLabel,
} from "@/features/experiments/model/metrics";
import { addDays } from "@/lib/dates";
import {
  globalMetricChangeSchema,
  saveReflectionSchema,
  dailyReflectionSchema,
} from "@/features/reflections/model/schemas";
import type { GlobalMetric } from "@/features/reflections/model/types";
import type { Database } from "../db/client";
import {
  workspaces,
  experiments,
  experimentMetrics,
  dailyEntries,
  dailyEntryValues,
  targetExtensions,
  localImports,
  globalMetrics,
  dailyReflections,
  dailyReflectionValues,
} from "../db/schema";
import { isoTimestamp, toExperiment } from "./mapper";

const GLOBAL_BUILT_INS = [
  "mood",
  "energy",
  "stress",
  "focus",
  "anxiety",
  "pain",
  "motivation",
  "sleep",
] as const;

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
  async function seedGlobalMetrics(executor: Executor) {
    await executor
      .insert(globalMetrics)
      .values(
        GLOBAL_BUILT_INS.map((id) => ({
          workspaceId,
          metricId: id,
          kind: "built_in",
          label: metricLabel(builtInMetric(id)),
          active: id === "mood" || id === "energy",
        })),
      )
      .onConflictDoNothing();
  }
  async function metricRows(executor: Executor) {
    return executor.select().from(globalMetrics).where(eq(globalMetrics.workspaceId, workspaceId));
  }
  function mapGlobalMetric(row: typeof globalMetrics.$inferSelect): GlobalMetric {
    return {
      definition:
        row.kind === "custom"
          ? {
              id: row.metricId as `custom_${string}`,
              kind: "custom",
              label: row.label,
              scale: { ...DEFAULT_NUMERIC_SCALE },
            }
          : builtInMetric(row.metricId as ReturnType<typeof builtInMetric>["id"]),
      active: row.active,
    };
  }
  async function reflectionRows(executor: Executor) {
    const rows = await executor
      .select()
      .from(dailyReflections)
      .where(eq(dailyReflections.workspaceId, workspaceId))
      .orderBy(desc(dailyReflections.observedDate));
    if (!rows.length) return [];
    const values = await executor
      .select()
      .from(dailyReflectionValues)
      .where(
        inArray(
          dailyReflectionValues.reflectionId,
          rows.map((row) => row.id),
        ),
      );
    const metrics = await metricRows(executor);
    const ids = new Map(metrics.map((metric) => [metric.id, metric.metricId]));
    return rows.map((row) =>
      dailyReflectionSchema.parse({
        id: row.id,
        observedDate: row.observedDate,
        note: row.note,
        recordedAt: isoTimestamp(row.recordedAt),
        updatedAt: isoTimestamp(row.updatedAt),
        values: Object.fromEntries(
          values
            .filter((value) => value.reflectionId === row.id)
            .map((value) => [ids.get(value.metricId), value.value]),
        ),
      }),
    );
  }
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
        outcomeSource: experiment.outcomeSource ?? "scoped",
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
    async listGlobalMetrics() {
      return db.transaction(async (tx) => {
        await seedGlobalMetrics(tx);
        const rows = await metricRows(tx);
        return rows
          .sort((a, b) => {
            const first = GLOBAL_BUILT_INS.indexOf(a.metricId as (typeof GLOBAL_BUILT_INS)[number]);
            const second = GLOBAL_BUILT_INS.indexOf(
              b.metricId as (typeof GLOBAL_BUILT_INS)[number],
            );
            return first >= 0 && second >= 0
              ? first - second
              : first >= 0
                ? -1
                : second >= 0
                  ? 1
                  : a.label.localeCompare(b.label);
          })
          .map(mapGlobalMetric);
      });
    },
    async changeGlobalMetric(input) {
      const change = globalMetricChangeSchema.parse(input);
      return db.transaction(async (tx) => {
        await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId)).for("update");
        await seedGlobalMetrics(tx);
        const rows = await metricRows(tx);
        if (change.type === "create" || change.type === "rename") {
          if (
            rows.some(
              (row) =>
                row.metricId !== change.id &&
                (normalizeMetricLabel(row.label) === normalizeMetricLabel(change.label) ||
                  (row.kind === "built_in" &&
                    normalizeMetricLabel(row.metricId) === normalizeMetricLabel(change.label))),
            )
          )
            throw new AppError("metricDuplicate");
        }
        const current = rows.find((row) => row.metricId === change.id);
        if (change.type === "create") {
          if (current) throw new AppError("metricDuplicate");
          await tx.insert(globalMetrics).values({
            workspaceId,
            metricId: change.id,
            kind: "custom",
            label: change.label,
            active: true,
          });
        } else {
          if (!current) throw new AppError("invalidRequest");
          if (change.type === "rename") {
            if (current.kind !== "custom") throw new AppError("invalidRequest");
            await tx
              .update(globalMetrics)
              .set({ label: change.label })
              .where(eq(globalMetrics.id, current.id));
          } else {
            await tx
              .update(globalMetrics)
              .set({ active: change.active })
              .where(eq(globalMetrics.id, current.id));
          }
        }
        return (await metricRows(tx)).map(mapGlobalMetric);
      });
    },
    async listReflections() {
      return db.transaction((tx) => reflectionRows(tx), {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    },
    async saveReflection(input) {
      const parsed = saveReflectionSchema.parse(input);
      return db.transaction(async (tx) => {
        await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId)).for("update");
        await seedGlobalMetrics(tx);
        const instant = now();
        const today = calendarDateInZone(parsed.timeZone, instant);
        if (parsed.observedDate > today) throw new AppError("futureEntry");
        const [existing] = await tx
          .select()
          .from(dailyReflections)
          .where(
            and(
              eq(dailyReflections.workspaceId, workspaceId),
              eq(dailyReflections.observedDate, parsed.observedDate),
            ),
          );
        if (!existing && parsed.observedDate < addDays(today, -1))
          throw new AppError("recentEntryOnly");
        const metrics = await metricRows(tx);
        const oldValues = existing
          ? await tx
              .select()
              .from(dailyReflectionValues)
              .where(eq(dailyReflectionValues.reflectionId, existing.id))
          : [];
        const values = Object.entries(parsed.draft.values).map(([id, value]) => {
          const metric = metrics.find((item) => item.metricId === id);
          if (!metric || (!metric.active && !oldValues.some((old) => old.metricId === metric.id)))
            throw new AppError("invalidRequest");
          return { metric, value };
        });
        const [saved] = await tx
          .insert(dailyReflections)
          .values({
            workspaceId,
            observedDate: parsed.observedDate,
            note: parsed.draft.note ?? "",
            recordedAt: instant.toISOString(),
          })
          .onConflictDoUpdate({
            target: [dailyReflections.workspaceId, dailyReflections.observedDate],
            set: { note: parsed.draft.note ?? "", updatedAt: instant.toISOString() },
          })
          .returning();
        await tx
          .delete(dailyReflectionValues)
          .where(eq(dailyReflectionValues.reflectionId, saved.id));
        if (values.length)
          await tx.insert(dailyReflectionValues).values(
            values.map(({ metric, value }) => ({
              reflectionId: saved.id,
              metricId: metric.id,
              workspaceId,
              value,
            })),
          );
        return (await reflectionRows(tx)).find((reflection) => reflection.id === saved.id)!;
      });
    },
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
      if (parsed.draft.outcomeSource === "global") {
        const available = await this.listGlobalMetrics();
        if (
          parsed.draft.metrics.some(
            (metric) => !available.some((item) => isDeepStrictEqual(item.definition, metric)),
          )
        )
          throw new AppError("invalidRequest");
      }
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
        if (candidate.outcomeSource === "global")
          await tx
            .update(globalMetrics)
            .set({ active: true })
            .where(
              and(
                eq(globalMetrics.workspaceId, workspaceId),
                inArray(
                  globalMetrics.metricId,
                  candidate.metrics.map((metric) => metric.id),
                ),
              ),
            );
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
