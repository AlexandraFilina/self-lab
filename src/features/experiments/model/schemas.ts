import { z } from "zod";
import { t } from "@/i18n";
import {
  METRIC_IDS,
  type DailyEntryDraft,
  type MetricDefinition,
  type MetricValues,
  type CustomMetricDefinition,
  type NewExperiment,
  type Experiment,
  type LegacyExperiment,
} from "./types";
import { hasDuplicateMetric, isMetricValue } from "./metrics";
import { addDays } from "@/lib/dates";

export const EXPERIMENT_LIMITS = {
  title: 120,
  question: 600,
  habit: 500,
  note: 500,
  customMetricLabel: 40,
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
const legacyValuesSchema = z
  .object({
    sleep: score.optional(),
    mood: score.optional(),
    productivity: score.optional(),
    energy: score.optional(),
  })
  .strict();
const legacyMetricsSchema = z
  .array(z.enum(METRIC_IDS, { error: t.validation.metric }))
  .min(1, t.validation.metric)
  .refine((values) => new Set(values).size === values.length, t.validation.duplicateMetric);
const numericScaleSchema = z
  .object({ kind: z.literal("numeric"), min: z.literal(1), max: z.literal(10), step: z.literal(1) })
  .strict();
const customMetricIdSchema = z.templateLiteral(["custom_", z.uuid()]);
export const customMetricSchema = z
  .object({
    id: customMetricIdSchema,
    kind: z.literal("custom"),
    label: z
      .string({ error: t.validation.customMetricName })
      .trim()
      .min(1, t.validation.customMetricName)
      .max(
        EXPERIMENT_LIMITS.customMetricLabel,
        t.validation.customMetricLength(EXPERIMENT_LIMITS.customMetricLabel),
      ),
    scale: numericScaleSchema,
  })
  .strict() satisfies z.ZodType<CustomMetricDefinition>;
export const metricDefinitionSchema = z.discriminatedUnion("kind", [
  z
    .object({ id: z.enum(METRIC_IDS), kind: z.literal("built_in"), scale: numericScaleSchema })
    .strict(),
  customMetricSchema,
]) satisfies z.ZodType<MetricDefinition>;
const metricsSchema = z
  .array(metricDefinitionSchema)
  .min(1, t.validation.metric)
  .refine((metrics) => !hasDuplicateMetric(metrics), t.validation.duplicateMetric);
const metricIdSchema = z.union([z.enum(METRIC_IDS), customMetricIdSchema]);
const valuesSchema = z.partialRecord(
  metricIdSchema,
  z.number({ error: t.validation.score }).finite(t.validation.score).optional(),
);
export const dateSchema = z.iso.date({ error: t.validation.date });
export const timestampSchema = z.iso.datetime({ error: t.validation.timestamp });
const previousNewExperimentSchema = z
  .object({
    title: text(t.form.name, 120),
    question: text(t.form.question, 600),
    habit: text(t.form.habit, 500),
    durationDays: z
      .number({ error: t.validation.duration })
      .int(t.validation.duration)
      .min(1, t.validation.duration)
      .max(365, t.validation.duration),
    metrics: legacyMetricsSchema,
  })
  .strict();
export const newExperimentSchema = previousNewExperimentSchema.extend({
  metrics: metricsSchema,
}) satisfies z.ZodType<NewExperiment>;
const entryDraftSchema = z
  .object({
    habitStatus: z.enum(["done", "not_done"], { error: t.checkIn.chooseStatus }),
    values: valuesSchema,
    note: z.string().trim().max(500, t.validation.note).optional(),
  })
  .strict();
function validateMetricValues(
  values: MetricValues,
  metrics: readonly MetricDefinition[],
  context: z.RefinementCtx,
) {
  for (const [id, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const metric = metrics.find((metric) => metric.id === id);
    if (!metric)
      context.addIssue({
        code: "custom",
        path: ["values", id],
        message: t.validation.unselectedMetric,
      });
    else if (!isMetricValue(value, metric.scale))
      context.addIssue({ code: "custom", path: ["values", id], message: t.validation.score });
  }
}
export function getDailyEntrySchema(metrics: readonly MetricDefinition[]) {
  return entryDraftSchema.superRefine((entry, context) =>
    validateMetricValues(entry.values, metrics, context),
  ) satisfies z.ZodType<DailyEntryDraft>;
}
const legacyEntrySchema = z
  .object({
    id: z.string().min(1),
    date: dateSchema,
    values: legacyValuesSchema,
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
    metrics: legacyMetricsSchema,
    startDate: dateSchema,
    entries: z.array(legacyEntrySchema),
  })
  .strict() satisfies z.ZodType<LegacyExperiment>;
export const versionTwoEntrySchema = z
  .object({
    id: z.string().min(1),
    date: dateSchema,
    habitStatus: z.enum(["done", "not_done"]).nullable(),
    values: legacyValuesSchema,
    note: z.string().max(500),
    origin: z.enum(["check_in", "legacy_ab"]),
  })
  .strict();
const previousStoredEntrySchema = versionTwoEntrySchema
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
const storedEntrySchema = z
  .object({ ...previousStoredEntrySchema.shape, values: valuesSchema })
  .strict()
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
      validateMetricValues(entry.values, experiment.metrics, context);
    }
  }) satisfies z.ZodType<Experiment>;
export const workspaceSchema = z
  .object({ version: z.literal(4), experiments: z.array(experimentSchema) })
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
          metrics: legacyMetricsSchema,
          entries: z.array(versionTwoEntrySchema),
        })
        .strict(),
    ),
  })
  .strict();

export const versionThreeWorkspaceSchema = z
  .object({
    version: z.literal(3),
    experiments: z.array(
      z
        .object({
          ...experimentSchema.shape,
          metrics: legacyMetricsSchema,
          entries: z.array(previousStoredEntrySchema),
        })
        .strict(),
    ),
  })
  .strict();
