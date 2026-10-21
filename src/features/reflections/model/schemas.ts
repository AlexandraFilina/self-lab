import { z } from "zod";
import { t } from "@/i18n";
import {
  metricDefinitionSchema,
  dateSchema,
  timestampSchema,
} from "@/features/experiments/model/schemas";
import { EXPERIMENT_LIMITS } from "@/features/experiments/model/schemas";
import { timeZoneSchema } from "@/features/experiments/model/api-contracts";
import type { DailyReflection, GlobalMetric } from "./types";

const valuesSchema = z
  .record(z.string().max(200), z.number().int().min(1).max(10))
  .refine(
    (values) => Object.keys(values).length > 0 && Object.keys(values).length <= 100,
    t.reflection.chooseValue,
  );
export const globalMetricSchema = z
  .object({
    definition: metricDefinitionSchema,
    active: z.boolean(),
  })
  .strict() satisfies z.ZodType<GlobalMetric>;
export const dailyReflectionSchema = z
  .object({
    id: z.uuid(),
    observedDate: dateSchema,
    values: valuesSchema,
    note: z.string().max(EXPERIMENT_LIMITS.note),
    recordedAt: timestampSchema,
    updatedAt: timestampSchema.nullable(),
  })
  .strict() satisfies z.ZodType<DailyReflection>;
export const saveReflectionSchema = z
  .object({
    observedDate: dateSchema,
    timeZone: timeZoneSchema,
    draft: z
      .object({
        values: valuesSchema,
        note: z.string().trim().max(EXPERIMENT_LIMITS.note, t.validation.note).optional(),
      })
      .strict(),
  })
  .strict();
const labelSchema = z
  .string()
  .trim()
  .min(1, t.validation.customMetricName)
  .max(
    EXPERIMENT_LIMITS.customMetricLabel,
    t.validation.customMetricLength(EXPERIMENT_LIMITS.customMetricLabel),
  );
export const globalMetricChangeSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("create"),
      id: z.templateLiteral(["custom_", z.uuid()]),
      label: labelSchema,
    })
    .strict(),
  z.object({ type: z.literal("rename"), id: z.string().max(200), label: labelSchema }).strict(),
  z.object({ type: z.literal("setActive"), id: z.string().max(200), active: z.boolean() }).strict(),
]);
