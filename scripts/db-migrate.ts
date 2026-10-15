import { migrate } from "drizzle-orm/node-postgres/migrator";
import { openDatabase } from "../src/server/db/client";
import { loadLocalEnv } from "./env";
async function main() {
  loadLocalEnv();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const { db, pool } = openDatabase(process.env.DATABASE_URL);
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
