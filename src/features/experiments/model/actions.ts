import { dayOffset } from "./analytics";
import { dateSchema, getDailyEntrySchema, newExperimentSchema } from "./schemas";
import type { DailyEntry, DailyEntryDraft, Experiment, NewExperiment } from "./types";

export function buildExperiment(draft: NewExperiment, id: string, startDate: string): Experiment {
  return {
    ...newExperimentSchema.parse(draft),
    id,
    startDate: dateSchema.parse(startDate),
    entries: [],
  };
}

export function buildDailyEntry(
  experiment: Experiment,
  draft: DailyEntryDraft,
  id: string,
  date: string,
): DailyEntry {
  dateSchema.parse(date);
  const day = dayOffset(experiment.startDate, date);
  if (day < 0 || day >= experiment.durationA + experiment.durationB)
    throw new Error("Check-ins must fall within the experiment's scheduled periods.");
  const existing = experiment.entries.find((entry) => entry.date === date);
  return { ...getDailyEntrySchema(experiment.metrics).parse(draft), id: existing?.id ?? id, date };
}

export type ExperimentsAction =
  | { type: "experimentCreated"; experiment: Experiment }
  | { type: "entrySaved"; experimentId: string; entry: DailyEntry };

export function experimentsReducer(state: Experiment[], action: ExperimentsAction): Experiment[] {
  switch (action.type) {
    case "experimentCreated":
      return [action.experiment, ...state];
    case "entrySaved":
      return state.map((experiment) =>
        experiment.id === action.experimentId
          ? {
              ...experiment,
              entries: [
                ...experiment.entries.filter((entry) => entry.date !== action.entry.date),
                action.entry,
              ].sort((a, b) => a.date.localeCompare(b.date)),
            }
          : experiment,
      );
  }
}
