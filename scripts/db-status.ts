import { sql } from "drizzle-orm";
import { loadLocalEnv } from "./env";
async function main() {
  loadLocalEnv();
  const { getDatabase } = await import("../src/server/db/client");
  const db = getDatabase();
  try {
    await db.execute(sql`select 1`);
    console.log("PostgreSQL is reachable.");
  } finally {
    await db.$client.end();
  }
}
void main().catch(() => {
  console.error(
    "PostgreSQL command failed. Check local environment, database availability, and migrations.",
  );
  process.exitCode = 1;
});
