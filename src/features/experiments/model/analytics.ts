import { addDays, dayOffset } from "@/lib/dates";
import type { DailyEntry, Experiment, MetricId } from "./types";
export { dayOffset } from "@/lib/dates";
export const MIN_OBSERVATIONS = 5;
export const SIMILARITY_THRESHOLD = 0.5;
export function endDate(experiment: Experiment) {
  return addDays(experiment.startDate, experiment.durationDays - 1);
}
export function getProgress(experiment: Experiment, referenceDate: string) {
  const total = experiment.durationDays;
  const elapsed = dayOffset(experiment.startDate, referenceDate);
  const recorded = experiment.entries.length;
  return {
    total,
    day: Math.min(total, Math.max(1, elapsed + 1)),
    recorded,
    completed: elapsed >= total,
    percent: total > 0 ? Math.min(100, Math.round((recorded / total) * 100)) : 0,
  };
}
export function groupObservations(entries: readonly DailyEntry[]) {
  return {
    done: entries.filter((entry) => entry.habitStatus === "done"),
    notDone: entries.filter((entry) => entry.habitStatus === "not_done"),
    unclassified: entries.filter((entry) => entry.habitStatus === null),
  };
}
export function summarizeMetric(entries: readonly DailyEntry[], metric: MetricId) {
  const values = entries
    .map((entry) => entry.values[metric])
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 10,
    );
  return {
    count: values.length,
    average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
  };
}
export function compareMetric(entries: readonly DailyEntry[], metric: MetricId) {
  const groups = groupObservations(entries);
  const done = summarizeMetric(groups.done, metric),
    notDone = summarizeMetric(groups.notDone, metric);
  const difference =
    done.average !== null && notDone.average !== null ? done.average - notDone.average : null;
  const enough = done.count >= MIN_OBSERVATIONS && notDone.count >= MIN_OBSERVATIONS;
  const conclusion: "insufficient" | "higher" | "lower" | "similar" =
    !enough || difference === null
      ? "insufficient"
      : Math.abs(difference) <= SIMILARITY_THRESHOLD
        ? "similar"
        : difference > 0
          ? "higher"
          : "lower";
  return { done, notDone, difference, enough, conclusion };
}

export function comparisonText(
  result: ReturnType<typeof compareMetric>,
  metricLabel: string,
  copy: {
    insufficient: string;
    higher: (metric: string) => string;
    lower: (metric: string) => string;
    similar: (metric: string) => string;
  },
): string {
  return result.conclusion === "insufficient"
    ? copy.insufficient
    : copy[result.conclusion](metricLabel);
}
