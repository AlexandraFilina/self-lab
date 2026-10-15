import { builtInMetric } from "../model/metrics";
import { t } from "@/i18n";
import { addDays } from "@/lib/dates";
import type { Experiment } from "../model/types";
import { LEGACY_EXPERIMENTS } from "./legacy-experiments";

export const COMPLETED_SAMPLE_ID = "morning-walk-completed";
export const SAMPLE_EXPERIMENT_IDS = [COMPLETED_SAMPLE_ID];
const RETIRED_SAMPLE_IDS = new Set([
  "morning-walk-daily",
  ...LEGACY_EXPERIMENTS.map((experiment) => experiment.id),
]);
export function createSampleExperiments(today: string): Experiment[] {
  return [createCompletedSampleExperiment(today)];
}

export function createCompletedSampleExperiment(today: string): Experiment {
  const startDate = addDays(today, -30);
  const doneDays = [0, 2, 4, 7, 8, 10, 12, 15, 17, 19, 22, 24, 27];
  const notDoneDays = [1, 5, 9, 13, 16, 20, 23, 26];
  const doneMood = [6, 8, 7, 6, 8, 7, 9, 7, 8, 6, 8, 7, 8];
  const notDoneMood = [5, 6, 7, 5, 6, 6, 7, 5];
  const doneProductivity = [7, 6, 8, 6, 7, 8, 6, 7, 6, 6, 7, 6, 7];
  const notDoneProductivity = [6, 7, 6, 5, 7, 6, 8, 7];
  const entries = [
    ...doneDays.map((day, index) => ({
      day,
      habitStatus: "done" as const,
      mood: doneMood[index],
      productivity: doneProductivity[index],
    })),
    ...notDoneDays.map((day, index) => ({
      day,
      habitStatus: "not_done" as const,
      mood: notDoneMood[index],
      productivity: notDoneProductivity[index],
    })),
  ]
    .sort((a, b) => a.day - b.day)
    .map((item) => ({
      id: `completed-walk-sample-${item.day}`,
      observedDate: addDays(startDate, item.day),
      habitStatus: item.habitStatus,
      values: { mood: item.mood, productivity: item.productivity },
      note: item.day === 8 ? t.samples.completedNote : "",
      recordedAt: null,
      updatedAt: null,
      origin: "check_in" as const,
    }));
  return {
    id: COMPLETED_SAMPLE_ID,
    mode: "daily_habit",
    source: "sample",
    title: t.samples.completedTitle,
    question: t.samples.completedQuestion,
    habit: t.samples.habit,
    startDate,
    durationDays: 28,
    metrics: [builtInMetric("mood"), builtInMetric("productivity")],
    entries,
  };
}
export function ensureCompletedSample(experiments: Experiment[], today: string): Experiment[] {
  const retained = experiments.filter(
    (experiment) => !(experiment.source === "sample" && RETIRED_SAMPLE_IDS.has(experiment.id)),
  );
  const removed = retained.length !== experiments.length;
  if (removed && !retained.some((experiment) => experiment.id === COMPLETED_SAMPLE_ID))
    return [...retained, createCompletedSampleExperiment(today)];
  return removed ? retained : experiments;
}
