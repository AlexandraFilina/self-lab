import { loadLocalEnv } from "./env";
async function main() {
  loadLocalEnv();
  if (process.env.NODE_ENV === "production")
    throw new Error("Development seed is unavailable in production.");
  const { getWorkspaceRepository } = await import("../src/server/experiments/service");
  const { getDatabase } = await import("../src/server/db/client");
  const db = getDatabase();
  try {
    await getWorkspaceRepository();
    console.log(
      "Development workspace ready. Fictional experiments are read-only fixtures, not database seeds.",
    );
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
