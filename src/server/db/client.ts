import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { AppError } from "@/lib/errors";
import * as schema from "./schema";

export function openDatabase(connectionString: string, serverless = false) {
  const pool = new Pool({
    connectionString,
    max: serverless ? 2 : 5,
    connectionTimeoutMillis: serverless ? 8000 : 3000,
    idleTimeoutMillis: serverless ? 1000 : 10000,
    ...(serverless ? {} : { statement_timeout: 10000, options: "-c timezone=UTC" }),
  });
  if (serverless) attachDatabasePool(pool);
  pool.on("error", () => console.error("PostgreSQL connection interrupted."));
  return { db: drizzle(pool, { schema }), pool };
}
export type Database = ReturnType<typeof openDatabase>["db"];
const globalDatabase = globalThis as typeof globalThis & {
  selfLabDatabase?: ReturnType<typeof openDatabase>;
};
export function getDatabase() {
  if (!process.env.DATABASE_URL) throw new AppError("backendConfiguration");
  if (process.env.VERCEL_ENV === "production") {
    try {
      const url = new URL(process.env.DATABASE_URL);
      if (
        !["postgres:", "postgresql:"].includes(url.protocol) ||
        url.searchParams.get("sslmode") !== "verify-full" ||
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )
        throw new Error();
    } catch {
      throw new AppError("backendConfiguration");
    }
  }
  return (globalDatabase.selfLabDatabase ??= openDatabase(
    process.env.DATABASE_URL,
    process.env.VERCEL === "1",
  )).db;
}
