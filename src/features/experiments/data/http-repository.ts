import { z } from "zod";
import { AppError } from "@/lib/errors";
import { t, type ErrorCode } from "@/i18n";
import { experimentSchema } from "../model/schemas";
import type { ExperimentsRepository } from "./repository";
function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && Object.hasOwn(t.errors, value);
}
export function createHttpRepository(): ExperimentsRepository {
  async function request<T>(path: string, schema: z.ZodType<T>, method = "GET", body?: unknown) {
    let response: Response;
    try {
      response = await fetch(`/api${path}`, {
        method,
        cache: "no-store",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new AppError("serverUnavailable");
    }
    const envelope = z
      .object({ data: z.unknown().optional(), error: z.object({ code: z.unknown() }).optional() })
      .safeParse(await response.json().catch(() => null));
    if (!envelope.success) throw new AppError("serverUnavailable");
    if (!response.ok)
      throw new AppError(
        isErrorCode(envelope.data.error?.code) ? envelope.data.error.code : "serverUnavailable",
      );
    const result = schema.safeParse(envelope.data.data);
    if (!result.success) throw new AppError("serverUnavailable");
    return result.data;
  }
  return {
    listExperiments: () => request("/experiments", z.array(experimentSchema)),
    getExperiment: (id) => request(`/experiments/${encodeURIComponent(id)}`, experimentSchema),
    createExperiment: (input) => request("/experiments", experimentSchema, "POST", input),
    saveEntry: (id, input) =>
      request(`/experiments/${encodeURIComponent(id)}/entries`, experimentSchema, "PUT", input),
    changeLifecycle: (id, input) =>
      request(`/experiments/${encodeURIComponent(id)}/lifecycle`, experimentSchema, "PATCH", input),
    importStatus: (experiments) => request("/imports/status", z.boolean(), "POST", { experiments }),
    importExperiments: (experiments) =>
      request(
        "/imports",
        z.object({ imported: z.number().int(), skipped: z.number().int() }),
        "POST",
        { experiments },
      ),
  };
}
