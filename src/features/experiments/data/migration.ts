import { z } from "zod";
import { AppError } from "@/lib/errors";
import {
  legacyExperimentSchema,
  workspaceSchema,
  versionTwoWorkspaceSchema,
  versionThreeWorkspaceSchema,
} from "../model/schemas";
import { builtInMetric } from "../model/metrics";
import type { Experiment, LegacyExperiment } from "../model/types";

export function adaptLegacyExperiment(
  legacy: LegacyExperiment,
  source: Experiment["source"] = "sample",
): Experiment {
  const original = structuredClone(legacyExperimentSchema.parse(legacy));
  return {
    id: original.id,
    mode: "daily_habit",
    title: original.title,
    question: original.hypothesis,
    habit: original.conditionB,
    durationDays: original.durationA + original.durationB,
    metrics: original.metrics.map(builtInMetric),
    startDate: original.startDate,
    source,
    entries: original.entries.map(({ date, ...entry }) => ({
      ...entry,
      observedDate: date,
      recordedAt: null,
      updatedAt: null,
      habitStatus: null,
      origin: "legacy_ab",
    })),
    legacy: original,
  };
}
export function decodeWorkspace(raw: string): { experiments: Experiment[]; migrated: boolean } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AppError("storageCorrupt");
  }
  if (typeof value === "object" && value !== null && "version" in value && value.version === 4) {
    const parsed = workspaceSchema.safeParse(value);
    if (!parsed.success) throw new AppError("storageCorrupt");
    return { experiments: parsed.data.experiments, migrated: false };
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    (value.version === 2 || value.version === 3)
  ) {
    const previous =
      value.version === 2
        ? versionTwoWorkspaceSchema.safeParse(value)
        : versionThreeWorkspaceSchema.safeParse(value);
    if (!previous.success) throw new AppError("storageCorrupt");
    const parsed = workspaceSchema.safeParse({
      version: 4,
      experiments: previous.data.experiments.map((experiment) => ({
        ...experiment,
        metrics: experiment.metrics.map(builtInMetric),
        entries: experiment.entries.map((entry) => {
          if (!("date" in entry)) return entry;
          const { date, ...original } = entry;
          return { ...original, observedDate: date, recordedAt: null, updatedAt: null };
        }),
      })),
    });
    if (!parsed.success) throw new AppError("storageCorrupt");
    return { experiments: parsed.data.experiments, migrated: true };
  }
  const legacyInput = Array.isArray(value)
    ? value
    : typeof value === "object" &&
        value !== null &&
        "version" in value &&
        value.version === 1 &&
        "experiments" in value
      ? value.experiments
      : undefined;
  if (legacyInput === undefined) throw new AppError("storageVersion");
  const legacy = z.array(legacyExperimentSchema).safeParse(legacyInput);
  if (!legacy.success) throw new AppError("storageCorrupt");
  const parsed = workspaceSchema.safeParse({
    version: 4,
    experiments: legacy.data.map((experiment) => adaptLegacyExperiment(experiment, "user")),
  });
  if (!parsed.success) throw new AppError("storageCorrupt");
  return { experiments: parsed.data.experiments, migrated: true };
}
