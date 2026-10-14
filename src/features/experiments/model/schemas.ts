import { z } from "zod";
import { METRIC_IDS, type DailyEntryDraft, type MetricId, type NewExperiment } from "./types";

export const EXPERIMENT_LIMITS = {
  title: 120,
  hypothesis: 600,
  condition: 500,
  note: 500,
  minPeriodDays: 1,
  maxPeriodDays: 90,
  minScore: 1,
  maxScore: 10,
} as const;

const text = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);
const duration = z
  .number()
  .int("Period duration must be a whole number.")
  .min(EXPERIMENT_LIMITS.minPeriodDays, "Each period must last at least 1 day.")
  .max(EXPERIMENT_LIMITS.maxPeriodDays, "Each period must last no more than 90 days.");
const score = z
  .number()
  .int("Scores must be whole numbers.")
  .min(EXPERIMENT_LIMITS.minScore, "Scores must be at least 1.")
  .max(EXPERIMENT_LIMITS.maxScore, "Scores must be no more than 10.");

export const dateSchema = z.iso.date();

export const newExperimentSchema = z
  .object({
    title: text("Experiment name", EXPERIMENT_LIMITS.title),
    hypothesis: text("Hypothesis", EXPERIMENT_LIMITS.hypothesis),
    conditionA: text("Period A conditions", EXPERIMENT_LIMITS.condition),
    conditionB: text("Period B conditions", EXPERIMENT_LIMITS.condition),
    durationA: duration,
    durationB: duration,
    metrics: z
      .array(z.enum(METRIC_IDS))
      .min(1, "Choose at least one metric.")
      .refine(
        (metrics) => new Set(metrics).size === metrics.length,
        "Choose each metric only once.",
      ),
  })
  .strict() satisfies z.ZodType<NewExperiment>;

const dailyEntrySchema = z
  .object({
    values: z
      .object({ sleep: score.optional(), mood: score.optional(), productivity: score.optional() })
      .strict(),
    note: z.string().trim().max(EXPERIMENT_LIMITS.note, "Notes must be 500 characters or fewer."),
  })
  .strict() satisfies z.ZodType<DailyEntryDraft>;

export function getDailyEntrySchema(metrics: readonly MetricId[]) {
  return dailyEntrySchema.superRefine((entry, context) => {
    for (const metric of metrics) {
      if (entry.values[metric] === undefined)
        context.addIssue({
          code: "custom",
          path: ["values", metric],
          message: "Score every selected metric.",
        });
    }
    for (const metric of METRIC_IDS) {
      if (entry.values[metric] !== undefined && !metrics.includes(metric))
        context.addIssue({
          code: "custom",
          path: ["values", metric],
          message: "Only score metrics selected for this experiment.",
        });
    }
  });
}
