import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { AppError } from "@/lib/errors";
import * as schema from "./schema";

export function openDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 10000,
    options: "-c timezone=UTC",
  });
  pool.on("error", () => console.error("PostgreSQL connection interrupted."));
  return { db: drizzle(pool, { schema }), pool };
}
export type Database = ReturnType<typeof openDatabase>["db"];
const globalDatabase = globalThis as typeof globalThis & {
  selfLabDatabase?: ReturnType<typeof openDatabase>;
};
export function getDatabase() {
  if (!process.env.DATABASE_URL) throw new AppError("backendConfiguration");
  return (globalDatabase.selfLabDatabase ??= openDatabase(process.env.DATABASE_URL)).db;
}
