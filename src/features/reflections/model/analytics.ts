import type { DailyReflection } from "./types";
import type { DailyEntry, Experiment } from "@/features/experiments/model/types";

export function outcomeEntries(
  experiment: Experiment,
  reflections: readonly DailyReflection[],
): DailyEntry[] {
  if (experiment.outcomeSource !== "global") return experiment.entries;
  const byDate = new Map(reflections.map((reflection) => [reflection.observedDate, reflection]));
  return experiment.entries.map((entry) => ({
    ...entry,
    values: Object.fromEntries(
      experiment.metrics.flatMap((metric) => {
        const value = byDate.get(entry.observedDate)?.values[metric.id];
        return value === undefined ? [] : [[metric.id, value]];
      }),
    ),
  }));
}
