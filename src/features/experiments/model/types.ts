export const METRIC_IDS = ["sleep", "mood", "productivity"] as const;
export type MetricId = (typeof METRIC_IDS)[number];
export type ExperimentStatus = "active" | "completed";
export type Period = "A" | "B";

export interface DailyEntry {
  id: string;
  date: string;
  values: Partial<Record<MetricId, number>>;
  note: string;
}

export interface Experiment {
  id: string;
  title: string;
  hypothesis: string;
  conditionA: string;
  conditionB: string;
  durationA: number;
  durationB: number;
  metrics: MetricId[];
  startDate: string;
  entries: DailyEntry[];
}

export type NewExperiment = Omit<Experiment, "id" | "startDate" | "entries">;

export type DailyEntryDraft = Pick<DailyEntry, "values" | "note">;
