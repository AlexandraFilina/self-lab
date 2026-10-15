import { t } from "@/i18n";
import type { BuiltInMetricId } from "../model/types";

export type ExperimentIdeaId = keyof typeof t.onboarding.ideas;
export interface ExperimentIdea {
  id: ExperimentIdeaId;
  label: string;
  title: string;
  question: string;
  habit: string;
  metricIds: readonly BuiltInMetricId[];
  durationDays: number;
}
export const EXPERIMENT_IDEAS: readonly ExperimentIdea[] = [
  { id: "morning_walk", ...t.onboarding.ideas.morning_walk, metricIds: ["mood"], durationDays: 14 },
  {
    id: "coffee_sleep",
    ...t.onboarding.ideas.coffee_sleep,
    metricIds: ["sleep"],
    durationDays: 14,
  },
  {
    id: "screen_sleep",
    ...t.onboarding.ideas.screen_sleep,
    metricIds: ["sleep"],
    durationDays: 14,
  },
  {
    id: "exercise_energy",
    ...t.onboarding.ideas.exercise_energy,
    metricIds: ["energy"],
    durationDays: 14,
  },
  {
    id: "focus_sessions",
    ...t.onboarding.ideas.focus_sessions,
    metricIds: ["productivity"],
    durationDays: 14,
  },
];
