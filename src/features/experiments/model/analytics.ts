import { addDays, dayOffset, localDate } from "@/lib/dates";
import { isMetricValue } from "./metrics";
import { DEFAULT_NUMERIC_SCALE, type NumericScale } from "./types";
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
    completed: experiment.status === "completed",
    windowComplete: elapsed >= total,
    elapsedDays: Math.max(0, elapsed + 1),
    percent: total > 0 ? Math.min(100, Math.round((recorded / total) * 100)) : 0,
  };
}
export function observedWindowDays(experiment: Experiment) {
  if (experiment.status !== "completed" || experiment.completedAt === null)
    return experiment.durationDays;
  return Math.min(
    experiment.durationDays,
    Math.max(0, dayOffset(experiment.startDate, localDate(new Date(experiment.completedAt))) + 1),
  );
}
export function groupObservations(entries: readonly DailyEntry[]) {
  return {
    done: entries.filter((entry) => entry.habitStatus === "done"),
    notDone: entries.filter((entry) => entry.habitStatus === "not_done"),
    unclassified: entries.filter((entry) => entry.habitStatus === null),
  };
}
export function summarizeMetric(
  entries: readonly DailyEntry[],
  metric: MetricId,
  scale: NumericScale = DEFAULT_NUMERIC_SCALE,
) {
  const values = entries
    .map((entry) => entry.values[metric])
    .filter((value): value is number => isMetricValue(value, scale));
  return {
    count: values.length,
    average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
  };
}
export type DataStrength = "too_early" | "early_pattern" | "worth_noticing";
export function getDataStrength(doneCount: number, notDoneCount: number): DataStrength {
  const minimum = Math.min(doneCount, notDoneCount);
  if (!Number.isFinite(minimum) || minimum < MIN_OBSERVATIONS) return "too_early";
  return minimum < 10 ? "early_pattern" : "worth_noticing";
}
export function calculateRelativeDifference(
  doneAverage: number | null,
  notDoneAverage: number | null,
): number | null {
  if (
    doneAverage === null ||
    notDoneAverage === null ||
    !Number.isFinite(doneAverage) ||
    !Number.isFinite(notDoneAverage) ||
    doneAverage < 0 ||
    notDoneAverage <= 0
  )
    return null;
  const value = ((doneAverage - notDoneAverage) / notDoneAverage) * 100;
  return Number.isFinite(value) ? value : null;
}
export function compareMetric(
  entries: readonly DailyEntry[],
  metric: MetricId,
  scale: NumericScale = DEFAULT_NUMERIC_SCALE,
) {
  const groups = groupObservations(entries);
  const done = summarizeMetric(groups.done, metric, scale),
    notDone = summarizeMetric(groups.notDone, metric, scale);
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
  return {
    done,
    notDone,
    difference,
    enough,
    conclusion,
    relativeDifference: enough ? calculateRelativeDifference(done.average, notDone.average) : null,
    strength: getDataStrength(done.count, notDone.count),
    missingScores: {
      done: groups.done.length - done.count,
      notDone: groups.notDone.length - notDone.count,
    },
    excluded: groups.unclassified.length,
  };
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

export type MetricComparison = ReturnType<typeof compareMetric>;
export function getResultDirection(result: MetricComparison) {
  if (result.conclusion === "insufficient" || result.conclusion === "similar")
    return result.conclusion;
  if (result.relativeDifference !== null && Math.abs(result.relativeDifference) < 10)
    return result.conclusion === "higher" ? "slightly_higher" : "slightly_lower";
  return result.conclusion;
}
export function getResultsEnding(
  results: readonly MetricComparison[],
): "pattern" | "similar" | "insufficient" {
  if (
    results.some(
      (result) =>
        result.enough && (result.conclusion === "higher" || result.conclusion === "lower"),
    )
  )
    return "pattern";
  return results.some((result) => result.enough) ? "similar" : "insufficient";
}
