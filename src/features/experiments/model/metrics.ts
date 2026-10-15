import { t } from "@/i18n";
import {
  DEFAULT_NUMERIC_SCALE,
  type BuiltInMetricId,
  type BuiltInMetricDefinition,
  type MetricDefinition,
  type NumericScale,
} from "./types";

export const METRICS: Record<
  BuiltInMetricId,
  { label: string; color: string; description: string }
> = {
  sleep: { ...t.metrics.sleep, color: "#7765df" },
  mood: { ...t.metrics.mood, color: "#48a899" },
  productivity: { ...t.metrics.productivity, color: "#d39753" },
  energy: { ...t.metrics.energy, color: "#a27ab7" },
};
export function builtInMetric(id: BuiltInMetricId): BuiltInMetricDefinition {
  return { id, kind: "built_in", scale: { ...DEFAULT_NUMERIC_SCALE } };
}
export function metricLabel(metric: MetricDefinition): string {
  return metric.kind === "built_in" ? METRICS[metric.id].label : metric.label;
}
export function metricColor(metric: MetricDefinition): string {
  return metric.kind === "built_in" ? METRICS[metric.id].color : "#a27ab7";
}
export function metricDescription(metric: MetricDefinition): string {
  return metric.kind === "built_in"
    ? METRICS[metric.id].description
    : t.metrics.customDescription(metric.label);
}
export function normalizeMetricLabel(label: string): string {
  return label.trim().normalize("NFKC").toLowerCase();
}
export function hasDuplicateMetric(metrics: readonly MetricDefinition[]): boolean {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const metric of metrics) {
    const aliases = new Set([
      normalizeMetricLabel(metricLabel(metric)),
      ...(metric.kind === "built_in" ? [metric.id] : []),
    ]);
    if (ids.has(metric.id) || [...aliases].some((name) => names.has(name))) return true;
    ids.add(metric.id);
    for (const name of aliases) names.add(name);
  }
  return false;
}
export function isMetricValue(value: unknown, scale: NumericScale): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= scale.min &&
    value <= scale.max &&
    Math.abs((value - scale.min) / scale.step - Math.round((value - scale.min) / scale.step)) < 1e-9
  );
}
