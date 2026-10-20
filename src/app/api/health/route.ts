import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/server/db/client";

export async function GET() {
  await connection();
  try {
    await getDatabase().execute(sql`select 1`);
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
