import { AppError } from "@/lib/errors";
import { dayOffset } from "@/lib/dates";
import { dateSchema, experimentSchema, EXPERIMENT_LIMITS, timestampSchema } from "./schemas";
import type { Experiment } from "./types";

export type LifecycleIntent =
  { type: "finish" } | { type: "reopen" } | { type: "extend"; additionalDays: number };

export type LifecycleCommand =
  | { type: "finish"; completedAt: string }
  | { type: "extend"; additionalDays: number; today: string; extendedAt: string }
  | { type: "reopen" };

export function extendedDuration(experiment: Experiment, additionalDays: number, today: string) {
  dateSchema.parse(today);
  if (!Number.isInteger(additionalDays) || additionalDays < 1)
    throw new AppError("invalidExtension");
  const durationDays =
    Math.max(experiment.durationDays, dayOffset(experiment.startDate, today)) + additionalDays;
  if (durationDays > EXPERIMENT_LIMITS.maxDays) throw new AppError("invalidExtension");
  return durationDays;
}

export function applyLifecycle(experiment: Experiment, command: LifecycleCommand): Experiment {
  switch (command.type) {
    case "finish":
      if (experiment.status !== "active") throw new AppError("lifecycleState");
      return experimentSchema.parse({
        ...experiment,
        status: "completed",
        completedAt: timestampSchema.parse(command.completedAt),
      });
    case "reopen":
      if (experiment.status !== "completed") throw new AppError("lifecycleState");
      return experimentSchema.parse({ ...experiment, status: "active", completedAt: null });
    case "extend": {
      if (experiment.status !== "active") throw new AppError("lifecycleState");
      const durationDays = extendedDuration(experiment, command.additionalDays, command.today);
      return experimentSchema.parse({
        ...experiment,
        durationDays,
        targetExtensions: [
          ...experiment.targetExtensions,
          {
            previousDurationDays: experiment.durationDays,
            durationDays,
            extendedAt: timestampSchema.parse(command.extendedAt),
          },
        ],
      });
    }
  }
}
