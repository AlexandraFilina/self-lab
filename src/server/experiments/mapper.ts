import "server-only";
import { experimentSchema } from "@/features/experiments/model/schemas";
import {
  experiments,
  experimentMetrics,
  dailyEntries,
  dailyEntryValues,
  targetExtensions,
} from "../db/schema";
export function isoTimestamp(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.replace(" ", "T").replace(/\+00(?::00)?$/, "Z");
  return normalized.replace(
    /(?:\.(\d+))?Z$/,
    (_match, fraction: string | undefined) =>
      `.${(fraction ?? "").padEnd(3, "0").replace(/(?<=\d{3})0+$/, "")}Z`,
  );
}
export function toExperiment(
  row: typeof experiments.$inferSelect,
  metrics: (typeof experimentMetrics.$inferSelect)[],
  entries: (typeof dailyEntries.$inferSelect)[],
  values: (typeof dailyEntryValues.$inferSelect)[],
  extensions: (typeof targetExtensions.$inferSelect)[],
) {
  const selectedMetrics = metrics
    .filter((metric) => metric.experimentId === row.id)
    .sort((a, b) => a.position - b.position);
  const metricIds = new Map(selectedMetrics.map((metric) => [metric.id, metric.metricId]));
  return experimentSchema.parse({
    id: row.publicId,
    mode: row.mode,
    source: row.source,
    status: row.status,
    completedAt: isoTimestamp(row.completedAt),
    title: row.title,
    question: row.question,
    habit: row.habit,
    durationDays: row.durationDays,
    startDate: row.startDate,
    metrics: selectedMetrics.map((metric) => ({
      id: metric.metricId,
      kind: metric.kind,
      ...(metric.kind === "custom" ? { label: metric.label } : {}),
      scale: {
        kind: metric.scaleKind,
        min: metric.scaleMin,
        max: metric.scaleMax,
        step: metric.scaleStep,
      },
    })),
    entries: entries
      .filter((entry) => entry.experimentId === row.id)
      .sort((a, b) => a.observedDate.localeCompare(b.observedDate))
      .map((entry) => ({
        id: entry.publicId,
        observedDate: entry.observedDate,
        habitStatus: entry.habitStatus,
        note: entry.note,
        origin: entry.origin,
        recordedAt: isoTimestamp(entry.recordedAt),
        updatedAt: isoTimestamp(entry.updatedAt),
        values: Object.fromEntries(
          values
            .filter((value) => value.entryId === entry.id)
            .map((value) => [metricIds.get(value.metricId), value.value]),
        ),
      })),
    targetExtensions: extensions
      .filter((extension) => extension.experimentId === row.id)
      .sort((a, b) => a.position - b.position)
      .map((extension) => ({
        previousDurationDays: extension.previousDurationDays,
        durationDays: extension.durationDays,
        extendedAt: isoTimestamp(extension.extendedAt),
      })),
    ...(row.legacy ? { legacy: row.legacy } : {}),
  });
}
