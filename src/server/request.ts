import "server-only";
import { AppError } from "@/lib/errors";
const MAX_BYTES = 2 * 1024 * 1024;
export async function readJson(request: Request, maximumBytes = MAX_BYTES): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError("invalidRequest");
  if (Number(request.headers.get("content-length")) > maximumBytes)
    throw new AppError("payloadTooLarge");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("invalidRequest");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new AppError("payloadTooLarge");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("invalidRequest");
  }
}
export function assertSameOrigin(request: Request) {
  if (request.method === "GET") return;
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("invalidRequest");
  const origin = request.headers.get("origin");
  if (!origin) return;
  try {
    const expected = new URL(request.url);
    // Next may use an internal hostname in request.url; Host reflects the public request.
    expected.host = request.headers.get("host") ?? expected.host;
    if (new URL(origin).origin === expected.origin) return;
  } catch {
    // Malformed or opaque origins are never a matching browser origin.
  }
  throw new AppError("invalidRequest");
}
