import "server-only";
import { connection } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { getWorkspaceRepository } from "./experiments/service";
import type { ExperimentsRepository } from "@/features/experiments/data/repository";
import { assertSameOrigin } from "./request";
export { readJson } from "./request";
export async function handleApi(
  request: Request,
  action: (repository: ExperimentsRepository) => Promise<unknown>,
) {
  await connection();
  try {
    assertSameOrigin(request);
    const result = await action(await getWorkspaceRepository(request));
    return Response.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code =
      error instanceof AppError
        ? error.code
        : error instanceof ZodError
          ? "invalidRequest"
          : "databaseUnavailable";
    const status =
      code === "unauthorized"
        ? 401
        : code === "experimentMissing"
          ? 404
          : code === "payloadTooLarge"
            ? 413
            : ["dataConflict", "importConflict", "lifecycleState"].includes(code)
              ? 409
              : ["backendConfiguration", "databaseUnavailable", "serverUnavailable"].includes(code)
                ? 503
                : 400;
    return Response.json({ error: { code } }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
