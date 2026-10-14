import type { Experiment } from "../model/types";
export interface ExperimentsRepository {
  load(): Promise<Experiment[] | null>;
  save(experiments: readonly Experiment[]): Promise<void>;
}
