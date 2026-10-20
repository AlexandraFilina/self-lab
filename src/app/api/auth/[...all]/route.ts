import { connection } from "next/server";
import { authResponse } from "@/server/auth/response";
import { getAuth } from "@/server/auth";
import { readJson, assertSameOrigin } from "@/server/request";
import { emailSchema, passwordSchema } from "@/features/auth/model/schemas";
import { z, ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { t } from "@/i18n";
const mutations = new Set([
  "sign-up/email",
  "sign-in/email",
  "sign-out",
  "request-password-reset",
  "reset-password",
  "send-verification-email",
]);
async function handle(request: Request) {
  await connection();
  const path = new URL(request.url).pathname.replace(/^\/api\/auth\//, "");
  const allowed =
    request.method === "GET"
      ? path === "verify-email" || /^reset-password\/[^/]+$/.test(path)
      : mutations.has(path);
  if (!allowed) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  try {
    assertSameOrigin(request);
    let forwarded = request;
    if (request.method === "POST") {
      const input =
        path === "sign-out" && request.body === null ? {} : await readJson(request, 32768);
      let body = z.record(z.string(), z.unknown()).parse(input);
      if (
        [
          "sign-up/email",
          "sign-in/email",
          "request-password-reset",
          "send-verification-email",
        ].includes(path)
      ) {
        body = { ...body, email: emailSchema.parse(body.email) };
      }
      if (path === "sign-up/email")
        body = { ...body, password: passwordSchema.parse(body.password), name: t.auth.defaultName };
      if (path === "reset-password")
        body = { ...body, newPassword: passwordSchema.parse(body.newPassword) };
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      headers.set("Content-Type", "application/json");
      forwarded = new Request(request.url, {
        method: request.method,
        headers,
        body: JSON.stringify(body),
      });
    }
    return await authResponse(await getAuth().handler(forwarded));
  } catch (error) {
    if (!(error instanceof ZodError) && !(error instanceof AppError)) {
      console.error(
        "Authentication operation failed",
        error instanceof Error ? error.name : "unknown",
      );
    }
    const status =
      error instanceof ZodError
        ? 400
        : error instanceof AppError
          ? error.code === "payloadTooLarge"
            ? 413
            : 400
          : 503;
    return Response.json(
      { code: status === 503 ? "AUTH_UNAVAILABLE" : "AUTH_FAILED" },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export const POST = handle;
export const GET = handle;
