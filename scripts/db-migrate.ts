import { migrate } from "drizzle-orm/node-postgres/migrator";
import { openDatabase } from "../src/server/db/client";
import { loadLocalEnv } from "./env";
async function main() {
  loadLocalEnv();
  const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required.");
  const url = new URL(connectionString);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local && !process.env.MIGRATION_DATABASE_URL)
    throw new Error("MIGRATION_DATABASE_URL is required for a remote database.");
  if (!local && url.searchParams.get("sslmode") !== "verify-full")
    throw new Error("Remote migrations require sslmode=verify-full.");
  if (process.env.MIGRATION_DATABASE_URL) {
    if (url.hostname.includes("-pooler."))
      throw new Error("Use a direct PostgreSQL URL for MIGRATION_DATABASE_URL.");
  }
  const { db, pool } = openDatabase(connectionString);
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    console.log("PostgreSQL migrations applied.");
  } finally {
    await pool.end();
  }
}
void main().catch(() => {
  console.error(
    "PostgreSQL command failed. Check local environment, database availability, and migrations.",
  );
  process.exitCode = 1;
});
