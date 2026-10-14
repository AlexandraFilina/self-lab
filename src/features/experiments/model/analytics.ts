import type { Experiment, MetricId, Period } from "./types";

export function dayOffset(start: string, date: string) {
  return Math.round(
    (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000,
  );
}

export function getProgress(experiment: Experiment, referenceDate: string) {
  const total = experiment.durationA + experiment.durationB;
  const elapsed = dayOffset(experiment.startDate, referenceDate);
  const completed = elapsed >= total;
  const day = Math.min(total, Math.max(1, elapsed + 1));
  const period: Period = day <= experiment.durationA ? "A" : "B";
  const periodDay = period === "A" ? day : day - experiment.durationA;
  const periodDuration = period === "A" ? experiment.durationA : experiment.durationB;
  const recorded = experiment.entries.length;
  return {
    total,
    day,
    period,
    periodDay,
    periodDuration,
    recorded,
    completed,
    percent: Math.round((recorded / total) * 100),
  };
}

export function periodForDate(experiment: Experiment, date: string): Period {
  return dayOffset(experiment.startDate, date) < experiment.durationA ? "A" : "B";
}

export function metricSummary(experiment: Experiment, metric: MetricId, period: Period) {
  const values = experiment.entries
    .filter((entry) => periodForDate(experiment, entry.date) === period)
    .map((entry) => entry.values[metric])
    .filter((value): value is number => typeof value === "number");
  return {
    count: values.length,
    average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
  };
}

export function endDate(experiment: Experiment) {
  const date = new Date(`${experiment.startDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + experiment.durationA + experiment.durationB - 1);
  return date.toISOString().slice(0, 10);
}
