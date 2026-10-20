import assert from "node:assert/strict";
import { test } from "node:test";
import { authResponse } from "../../src/server/auth/response";
test("library verification/reset redirects with JSON content-type are preserved without parsing an empty body", async () => {
  const response = await authResponse(
    new Response(null, {
      status: 302,
      headers: {
        "Content-Type": "application/json",
        Location: "/account",
        "Set-Cookie": "library-cookie=value; HttpOnly",
      },
    }),
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/account");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), "");
});
test("auth boundary preserves cookies but removes the duplicate session token from successful JSON", async () => {
  const response = await authResponse(
    Response.json(
      { token: "opaque-library-token", user: { id: "user" } },
      { headers: { "Set-Cookie": "library-cookie=value; HttpOnly" } },
    ),
  );
  assert.deepEqual(await response.json(), { user: { id: "user" } });
  assert.ok(response.headers.get("set-cookie")?.includes("HttpOnly"));
});
test("auth failures never expose database or library messages", async () => {
  const response = await authResponse(
    Response.json(
      { message: "Sensitive database detail", code: "INTERNAL_ERROR" },
      { status: 500 },
    ),
  );
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { code: "AUTH_FAILED" });
});
