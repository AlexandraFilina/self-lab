import { t } from "@/i18n";
import { addDays } from "@/lib/dates";
import type { Experiment } from "../model/types";
import { LEGACY_EXPERIMENTS } from "./legacy-experiments";
import { adaptLegacyExperiment } from "./migration";

export const SAMPLE_EXPERIMENT_IDS = [
  "morning-walk-daily",
  ...LEGACY_EXPERIMENTS.map((experiment) => experiment.id),
];
export function createSampleExperiments(today: string): Experiment[] {
  const startDate = addDays(today, -14);
  const walking: Experiment = {
    id: "morning-walk-daily",
    mode: "daily_habit",
    title: t.samples.title,
    question: t.samples.question,
    habit: t.samples.habit,
    durationDays: 28,
    metrics: ["mood", "energy"],
    startDate,
    source: "sample",
    entries: Array.from({ length: 14 }, (_, index) => {
      const done = index % 2 === 0;
      return {
        id: `walk-sample-${index}`,
        observedDate: addDays(startDate, index),
        recordedAt: null,
        updatedAt: null,
        habitStatus: done ? "done" : "not_done",
        values: { mood: done ? 7 + (index % 3) : 4 + (index % 3), energy: done ? 7 : 5 },
        note: index === 6 ? t.samples.note : "",
        origin: "check_in",
      };
    }),
  };
  return [walking, ...LEGACY_EXPERIMENTS.map((experiment) => adaptLegacyExperiment(experiment))];
}
