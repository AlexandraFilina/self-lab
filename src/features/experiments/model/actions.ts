import { AppError } from "@/lib/errors";
import { DEFAULT_NUMERIC_SCALE } from "./types";
import { addDays, dayOffset } from "@/lib/dates";
import {
  dateSchema,
  getDailyEntrySchema,
  newExperimentSchema,
  timestampSchema,
  customMetricSchema,
} from "./schemas";
import type { DailyEntry, DailyEntryDraft, Experiment, NewExperiment } from "./types";

export function buildExperiment(draft: NewExperiment, id: string, startDate: string): Experiment {
  return {
    ...newExperimentSchema.parse(draft),
    id,
    mode: "daily_habit",
    startDate: dateSchema.parse(startDate),
    entries: [],
    source: "user",
  };
}
export function buildDailyEntry(
  experiment: Experiment,
  draft: DailyEntryDraft,
  id: string,
  date: string,
  today: string,
  savedAt = new Date().toISOString(),
): DailyEntry {
  dateSchema.parse(date);
  dateSchema.parse(today);
  if (date > today) throw new AppError("futureEntry");
  const day = dayOffset(experiment.startDate, date);
  if (day < 0 || day >= experiment.durationDays) throw new AppError("outsideWindow");
  const existing = experiment.entries.find((entry) => entry.observedDate === date);
  if (!existing && date < addDays(today, -1)) throw new AppError("recentEntryOnly");
  const timestamp = timestampSchema.parse(savedAt);
  const parsed = getDailyEntrySchema(experiment.metrics).parse(draft);
  const values = Object.fromEntries(
    Object.entries(parsed.values).filter(([, value]) => value !== undefined),
  );
  return {
    ...parsed,
    values,
    note: parsed.note ?? "",
    id: existing?.id ?? id,
    observedDate: date,
    recordedAt: existing ? existing.recordedAt : timestamp,
    updatedAt: existing ? timestamp : null,
    origin: "check_in",
  };
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
                ...experiment.entries.filter(
                  (entry) => entry.observedDate !== action.entry.observedDate,
                ),
                action.entry,
              ].sort((a, b) => a.observedDate.localeCompare(b.observedDate)),
            }
          : experiment,
      );
  }
}

export function buildCustomMetric(label: string, uuid: string) {
  return customMetricSchema.parse({
    id: `custom_${uuid}`,
    label,
    kind: "custom",
    scale: { ...DEFAULT_NUMERIC_SCALE },
  });
}
