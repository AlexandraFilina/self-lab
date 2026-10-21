export const METRIC_IDS = [
  "sleep",
  "mood",
  "productivity",
  "energy",
  "stress",
  "focus",
  "anxiety",
  "pain",
  "motivation",
] as const;
export type BuiltInMetricId = (typeof METRIC_IDS)[number];
export type CustomMetricId = `custom_${string}`;
export type MetricId = BuiltInMetricId | CustomMetricId;
export interface NumericScale {
  kind: "numeric";
  min: number;
  max: number;
  step: number;
}
export const DEFAULT_NUMERIC_SCALE: NumericScale = { kind: "numeric", min: 1, max: 10, step: 1 };
export type BuiltInMetricDefinition = {
  id: BuiltInMetricId;
  kind: "built_in";
  scale: NumericScale;
};
export type CustomMetricDefinition = {
  id: CustomMetricId;
  label: string;
  kind: "custom";
  scale: NumericScale;
};
export type MetricDefinition = BuiltInMetricDefinition | CustomMetricDefinition;
export type ExperimentStatus = "active" | "completed";
export type HabitStatus = "done" | "not_done";
export type MetricValues = Partial<Record<MetricId, number>>;

export interface DailyEntry {
  id: string;
  observedDate: string;
  recordedAt: string | null;
  updatedAt: string | null;
  habitStatus: HabitStatus | null;
  values: MetricValues;
  note: string;
  origin: "check_in" | "legacy_ab";
}
export interface TargetExtension {
  previousDurationDays: number;
  durationDays: number;
  extendedAt: string;
}
export interface Experiment {
  status: ExperimentStatus;
  completedAt: string | null;
  targetExtensions: TargetExtension[];
  id: string;
  mode: "daily_habit";
  title: string;
  question: string;
  habit: string;
  durationDays: number;
  metrics: MetricDefinition[];
  outcomeSource?: "global";
  startDate: string;
  entries: DailyEntry[];
  source: "user" | "sample";
  legacy?: LegacyExperiment;
}
export type NewExperiment = Pick<
  Experiment,
  "title" | "question" | "habit" | "durationDays" | "metrics" | "outcomeSource"
>;
export interface DailyEntryDraft {
  habitStatus: HabitStatus;
  values: MetricValues;
  note?: string;
}
export interface LegacyDailyEntry {
  id: string;
  date: string;
  values: Partial<Record<BuiltInMetricId, number>>;
  note: string;
}
export interface LegacyExperiment {
  id: string;
  title: string;
  hypothesis: string;
  conditionA: string;
  conditionB: string;
  durationA: number;
  durationB: number;
  metrics: BuiltInMetricId[];
  startDate: string;
  entries: LegacyDailyEntry[];
}
