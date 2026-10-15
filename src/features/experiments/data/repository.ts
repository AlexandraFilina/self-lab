import type { DailyEntryDraft, Experiment, NewExperiment } from "../model/types";
import type { LifecycleIntent } from "../model/lifecycle";
export interface WorkspaceSnapshotRepository {
  load(): Promise<Experiment[] | null>;
  save(experiments: readonly Experiment[]): Promise<void>;
}
export interface CreateExperimentInput {
  id: string;
  draft: NewExperiment;
  timeZone: string;
}
export interface SaveEntryInput {
  observedDate: string;
  draft: DailyEntryDraft;
  timeZone: string;
}
export interface LifecycleInput {
  intent: LifecycleIntent;
  timeZone: string;
  requestId: string;
}
export interface ImportResult {
  imported: number;
  skipped: number;
}
export interface ExperimentsRepository {
  listExperiments(): Promise<Experiment[]>;
  getExperiment(id: string): Promise<Experiment>;
  createExperiment(input: CreateExperimentInput): Promise<Experiment>;
  saveEntry(id: string, input: SaveEntryInput): Promise<Experiment>;
  changeLifecycle(id: string, input: LifecycleInput): Promise<Experiment>;
  importStatus(experiments: readonly Experiment[]): Promise<boolean>;
  importExperiments(experiments: readonly Experiment[]): Promise<ImportResult>;
}
