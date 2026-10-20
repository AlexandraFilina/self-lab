import { connection } from "next/server";
import { getAuth } from "@/server/auth";
export async function GET(request: Request) {
  await connection();
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session)
      return Response.json(
        { error: { code: "unauthorized" } },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    return Response.json(
      { email: session.user.email, emailVerified: session.user.emailVerified },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: { code: "databaseUnavailable" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
