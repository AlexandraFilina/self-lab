import { addDays, dayOffset } from "@/lib/dates";
import { buildChartSegments } from "@/features/experiments/model/chart-segments";
import { isMetricValue } from "@/features/experiments/model/metrics";
import type { Experiment, MetricDefinition } from "@/features/experiments/model/types";
import type { DailyReflection, GlobalMetric } from "@/features/reflections/model/types";

export type TrendRange = 7 | 14 | 30 | "all";

export function availableTrendMetrics(metrics: readonly GlobalMetric[]): MetricDefinition[] {
  return metrics
    .filter(({ definition, active }) => definition.kind === "built_in" || active)
    .map(({ definition }) => definition);
}

export function trendWindow(
  reflections: readonly DailyReflection[],
  today: string,
  range: TrendRange,
  page: number,
) {
  const earliest = reflections
    .map(({ observedDate }) => observedDate)
    .filter((date) => date <= today)
    .sort()[0];
  const end = range === "all" ? today : addDays(today, -Math.max(0, page) * range);
  const start = range === "all" ? (earliest ?? today) : addDays(end, 1 - range);
  return {
    start,
    end,
    canPrevious: range !== "all" && Boolean(earliest && earliest < start),
    canNext: range !== "all" && page > 0,
  };
}

export function trendSeries(
  reflections: readonly DailyReflection[],
  metric: MetricDefinition,
  window: { start: string; end: string },
) {
  const points = reflections
    .flatMap(({ observedDate, values }) => {
      const value = values[metric.id];
      return observedDate >= window.start &&
        observedDate <= window.end &&
        isMetricValue(value, metric.scale)
        ? [{ date: observedDate, value }]
        : [];
    })
    .sort((first, second) => first.date.localeCompare(second.date));
  return { points, segments: buildChartSegments(points) };
}

export function trendActivity(
  experiments: readonly Experiment[],
  selectedId: string | null,
  window: { start: string; end: string },
) {
  const experiment = experiments.find((item) => item.id === selectedId && item.source === "user");
  if (!experiment) return [];
  return experiment.entries
    .filter(
      (entry) =>
        entry.observedDate >= window.start &&
        entry.observedDate <= window.end &&
        (entry.habitStatus === "done" || entry.habitStatus === "not_done"),
    )
    .map((entry) => ({
      date: entry.observedDate,
      experimentId: experiment.id,
      title: experiment.title,
      status: entry.habitStatus as "done" | "not_done",
      day: dayOffset(window.start, entry.observedDate),
    }))
    .sort((first, second) => first.date.localeCompare(second.date));
}
