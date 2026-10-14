export const METRIC_IDS = ["sleep", "mood", "productivity", "energy"] as const;
export type MetricId = (typeof METRIC_IDS)[number];
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
export interface Experiment {
  id: string;
  mode: "daily_habit";
  title: string;
  question: string;
  habit: string;
  durationDays: number;
  metrics: MetricId[];
  startDate: string;
  entries: DailyEntry[];
  source: "user" | "sample";
  legacy?: LegacyExperiment;
}
export type NewExperiment = Pick<
  Experiment,
  "title" | "question" | "habit" | "durationDays" | "metrics"
>;
export interface DailyEntryDraft {
  habitStatus: HabitStatus;
  values: MetricValues;
  note?: string;
}
export interface LegacyDailyEntry {
  id: string;
  date: string;
  values: MetricValues;
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
  metrics: MetricId[];
  startDate: string;
  entries: LegacyDailyEntry[];
}
