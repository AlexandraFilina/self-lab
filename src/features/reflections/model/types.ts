import type { MetricDefinition, MetricValues } from "@/features/experiments/model/types";

export interface GlobalMetric {
  definition: MetricDefinition;
  active: boolean;
}

export interface DailyReflection {
  id: string;
  observedDate: string;
  values: MetricValues;
  note: string;
  recordedAt: string;
  updatedAt: string | null;
}

export interface ReflectionDraft {
  values: MetricValues;
  note?: string;
}

export type GlobalMetricChange =
  | { type: "create"; id: string; label: string }
  | { type: "rename"; id: string; label: string }
  | { type: "setActive"; id: string; active: boolean };
