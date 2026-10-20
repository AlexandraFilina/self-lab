import "server-only";
export async function authResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  // Library redirects may carry a JSON content-type with an empty body.
  if (response.status >= 300 && response.status < 400)
    return new Response(response.body, { status: response.status, headers });
  if (!headers.get("content-type")?.includes("application/json"))
    return new Response(response.body, { status: response.status, headers });
  const json: unknown = await response.json();
  headers.delete("content-length");
  if (!response.ok)
    return Response.json(
      { code: response.status === 429 ? "RATE_LIMITED" : "AUTH_FAILED" },
      { status: response.status, headers },
    );
  if (json && typeof json === "object" && "token" in json) delete json.token;
  return Response.json(json, { status: response.status, headers });
}
