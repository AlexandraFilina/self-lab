import { isMetricValue } from "@/features/experiments/model/metrics";
import type { DailyReflection, GlobalMetric } from "./types";

export function reflectionCompletion(
  metrics: readonly GlobalMetric[],
  reflection: DailyReflection | undefined,
) {
  const active = metrics.filter((metric) => metric.active);
  const recorded = active.filter(({ definition }) =>
    isMetricValue(reflection?.values[definition.id], definition.scale),
  );
  const missing = active.filter((metric) => !recorded.includes(metric));
  return {
    active,
    recorded,
    missing,
    total: active.length,
    recordedCount: recorded.length,
    complete: reflection !== undefined && missing.length === 0,
  };
}
