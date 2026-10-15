import type { ExperimentIdea } from "../data/experiment-ideas";
import { builtInMetric } from "./metrics";
import type { Experiment, NewExperiment } from "./types";

export function needsOnboarding(experiments: readonly Experiment[]) {
  return !experiments.some((experiment) => experiment.source === "user");
}
export function createEmptyExperimentDraft(): NewExperiment {
  return { title: "", question: "", habit: "", durationDays: 14, metrics: [] };
}
export function createIdeaDraft(idea: ExperimentIdea): NewExperiment {
  return {
    title: idea.title,
    question: idea.question,
    habit: idea.habit,
    durationDays: idea.durationDays,
    metrics: idea.metricIds.map(builtInMetric),
  };
}
