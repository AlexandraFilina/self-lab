import assert from "node:assert/strict";
import { test } from "node:test";
import { assertSameOrigin, readJson } from "../../src/server/request";
import { AppError } from "../../src/lib/errors";
const coded = (code: string) => (error: unknown) =>
  error instanceof AppError && error.code === code;

test("same-origin mutations use the public Host when Next uses an internal request URL", () => {
  assert.doesNotThrow(() =>
    assertSameOrigin(
      new Request("http://localhost:3101/api/experiments", {
        method: "POST",
        headers: { Host: "127.0.0.1:3101", Origin: "http://127.0.0.1:3101" },
      }),
    ),
  );
});
test("cross-site, malformed, opaque, and wrong-port mutation origins are rejected", () => {
  const cases: Record<string, string>[] = [
    { Host: "127.0.0.1:3101", Origin: "https://other.example" },
    { Host: "127.0.0.1:3101", Origin: "http://127.0.0.1:3102" },
    { Host: "127.0.0.1:3101", Origin: "null" },
    { Host: "127.0.0.1:3101", Origin: "invalid" },
    { Host: "127.0.0.1:3101", Origin: "http://127.0.0.1:3101", "sec-fetch-site": "cross-site" },
  ];
  for (const headers of cases)
    assert.throws(
      () =>
        assertSameOrigin(
          new Request("http://localhost:3101/api/experiments", { method: "POST", headers }),
        ),
      coded("invalidRequest"),
    );
});
test("JSON body validation rejects non-JSON, malformed, and oversized streamed input", async () => {
  const make = (
    body: BodyInit,
    headers: Record<string, string> = { "Content-Type": "application/json" },
  ) =>
    new Request("http://localhost/api/imports", {
      method: "POST",
      body,
      headers,
      duplex: "half",
    } as RequestInit);
  assert.deepEqual(await readJson(make('{"valid":true}')), { valid: true });
  await assert.rejects(readJson(make("invalid")), coded("invalidRequest"));
  await assert.rejects(
    readJson(make("{}", { "Content-Type": "text/plain" })),
    coded("invalidRequest"),
  );
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
      controller.close();
    },
  });
  await assert.rejects(readJson(make(stream)), coded("payloadTooLarge"));
});
