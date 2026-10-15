import { existsSync } from "node:fs";
export function loadLocalEnv() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}
export function testDatabaseUrl() {
  loadLocalEnv();
  const value = process.env.TEST_DATABASE_URL;
  if (!value)
    throw new Error("TEST_DATABASE_URL is required; use a separate PostgreSQL test database.");
  const url = new URL(value);
  if (
    !url.pathname.endsWith("_test") ||
    (!process.env.CI && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  )
    throw new Error("Tests require a local database with a name ending in _test.");
  return value;
}
