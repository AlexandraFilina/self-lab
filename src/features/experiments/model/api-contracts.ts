import { z } from "zod";
import { dateSchema, experimentSchema, newExperimentSchema } from "./schemas";
export const publicIdSchema = z.string().min(1).max(200);
export const timeZoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  });
export const createRequestSchema = z
  .object({ id: z.uuid(), draft: newExperimentSchema, timeZone: timeZoneSchema })
  .strict();
export const saveEntryRequestSchema = z
  .object({
    observedDate: dateSchema,
    draft: z
      .object({
        habitStatus: z.enum(["done", "not_done"]),
        values: z
          .record(z.string().max(200), z.number().finite())
          .refine((values) => Object.keys(values).length <= 100),
        note: z.string().max(500).optional(),
      })
      .strict(),
    timeZone: timeZoneSchema,
  })
  .strict();
export const lifecycleRequestSchema = z
  .object({
    requestId: z.uuid(),
    timeZone: timeZoneSchema,
    intent: z.discriminatedUnion("type", [
      z.object({ type: z.literal("finish") }).strict(),
      z.object({ type: z.literal("reopen") }).strict(),
      z
        .object({ type: z.literal("extend"), additionalDays: z.number().int().min(1).max(365) })
        .strict(),
    ]),
  })
  .strict();
export const importRequestSchema = z
  .object({
    experiments: z
      .array(
        experimentSchema.superRefine((experiment, context) => {
          if (
            experiment.source !== "user" ||
            experiment.id.length > 200 ||
            experiment.entries.some((entry) => entry.id.length > 200)
          )
            context.addIssue({ code: "custom", message: "Invalid user import." });
        }),
      )
      .max(100),
  })
  .strict();
export function calendarDateInZone(timeZone: string, instant: Date) {
  timeZoneSchema.parse(timeZone);
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === name)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
