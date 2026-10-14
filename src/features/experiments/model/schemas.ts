import { z } from "zod";
import { t } from "@/i18n";
import {
  METRIC_IDS,
  type DailyEntryDraft,
  type MetricId,
  type NewExperiment,
  type Experiment,
  type LegacyExperiment,
} from "./types";
import { addDays } from "@/lib/dates";

export const EXPERIMENT_LIMITS = {
  title: 120,
  question: 600,
  habit: 500,
  note: 500,
  minDays: 1,
  maxDays: 365,
  minScore: 1,
  maxScore: 10,
} as const;
const text = (label: string, max: number) =>
  z.string().trim().min(1, t.validation.required(label)).max(max, t.validation.length(label, max));
const score = z
  .number({ error: t.validation.score })
  .int(t.validation.score)
  .min(1, t.validation.score)
  .max(10, t.validation.score);
const valuesSchema = z
  .object({
    sleep: score.optional(),
    mood: score.optional(),
    productivity: score.optional(),
    energy: score.optional(),
  })
  .strict();
const metricsSchema = z
  .array(z.enum(METRIC_IDS, { error: t.validation.metric }))
  .min(1, t.validation.metric)
  .refine((values) => new Set(values).size === values.length, t.validation.duplicateMetric);
export const dateSchema = z.iso.date({ error: t.validation.date });
export const timestampSchema = z.iso.datetime({ error: t.validation.timestamp });
export const newExperimentSchema = z
  .object({
    title: text(t.form.name, 120),
    question: text(t.form.question, 600),
    habit: text(t.form.habit, 500),
    durationDays: z
      .number({ error: t.validation.duration })
      .int(t.validation.duration)
      .min(1, t.validation.duration)
      .max(365, t.validation.duration),
    metrics: metricsSchema,
  })
  .strict() satisfies z.ZodType<NewExperiment>;
const entryDraftSchema = z
  .object({
    habitStatus: z.enum(["done", "not_done"], { error: t.checkIn.chooseStatus }),
    values: valuesSchema,
    note: z.string().trim().max(500, t.validation.note).optional(),
  })
  .strict();
export function getDailyEntrySchema(metrics: readonly MetricId[]) {
  return entryDraftSchema.superRefine((entry, context) => {
    for (const metric of METRIC_IDS)
      if (entry.values[metric] !== undefined && !metrics.includes(metric))
        context.addIssue({
          code: "custom",
          path: ["values", metric],
          message: t.validation.unselectedMetric,
        });
  }) satisfies z.ZodType<DailyEntryDraft>;
}
const legacyEntrySchema = z
  .object({
    id: z.string().min(1),
    date: dateSchema,
    values: valuesSchema,
    note: z.string().max(500),
  })
  .strict();
export const legacyExperimentSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    hypothesis: z.string(),
    conditionA: z.string(),
    conditionB: z.string(),
    durationA: z.number().int().min(1).max(90),
    durationB: z.number().int().min(1).max(90),
    metrics: metricsSchema,
    startDate: dateSchema,
    entries: z.array(legacyEntrySchema),
  })
  .strict() satisfies z.ZodType<LegacyExperiment>;
export const versionTwoEntrySchema = z
  .object({
    id: z.string().min(1),
    date: dateSchema,
    habitStatus: z.enum(["done", "not_done"]).nullable(),
    values: valuesSchema,
    note: z.string().max(500),
    origin: z.enum(["check_in", "legacy_ab"]),
  })
  .strict();
const storedEntrySchema = versionTwoEntrySchema
  .omit({ date: true })
  .extend({
    observedDate: dateSchema,
    recordedAt: timestampSchema.nullable(),
    updatedAt: timestampSchema.nullable(),
  })
  .refine(
    (entry) => entry.habitStatus !== null || entry.origin === "legacy_ab",
    t.validation.imported,
  );
export const experimentSchema = newExperimentSchema
  .extend({
    id: z.string().min(1),
    mode: z.literal("daily_habit"),
    startDate: dateSchema,
    entries: z.array(storedEntrySchema),
    source: z.enum(["user", "sample"]),
    legacy: legacyExperimentSchema.optional(),
  })
  .superRefine((experiment, context) => {
    if (
      new Set(experiment.entries.map((entry) => entry.observedDate)).size !==
      experiment.entries.length
    )
      context.addIssue({ code: "custom", message: t.validation.duplicateDates });
    for (const entry of experiment.entries) {
      if (
        entry.observedDate < experiment.startDate ||
        entry.observedDate > addDays(experiment.startDate, experiment.durationDays - 1)
      )
        context.addIssue({ code: "custom", message: t.errors.outsideWindow });
      for (const metric of METRIC_IDS)
        if (entry.values[metric] !== undefined && !experiment.metrics.includes(metric))
          context.addIssue({ code: "custom", message: t.validation.unselectedMetric });
    }
  }) satisfies z.ZodType<Experiment>;
export const workspaceSchema = z
  .object({ version: z.literal(3), experiments: z.array(experimentSchema) })
  .strict()
  .refine(
    (state) =>
      new Set(state.experiments.map((experiment) => experiment.id)).size ===
      state.experiments.length,
    t.validation.duplicateIds,
  );

export const versionTwoWorkspaceSchema = z
  .object({
    version: z.literal(2),
    experiments: z.array(
      z
        .object({
          ...experimentSchema.shape,
          entries: z.array(versionTwoEntrySchema),
        })
        .strict(),
    ),
  })
  .strict();
