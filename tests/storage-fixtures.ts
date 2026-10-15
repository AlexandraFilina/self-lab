import type { Experiment } from "../src/features/experiments/model/types";

export function versionFourExperiment(experiment: Experiment) {
  const previous: Partial<Experiment> = structuredClone(experiment);
  delete previous.status;
  delete previous.completedAt;
  delete previous.targetExtensions;
  return previous as Omit<Experiment, "status" | "completedAt" | "targetExtensions">;
}
