import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { workspaces } from "../db/schema";
export async function personalWorkspace(db: Database, userId: string) {
  const match = and(eq(workspaces.ownerUserId, userId), eq(workspaces.isPersonal, true));
  const [existing] = await db.select().from(workspaces).where(match);
  if (existing) return existing;
  await db
    .insert(workspaces)
    .values({ id: randomUUID(), name: "Personal workspace", ownerUserId: userId, isPersonal: true })
    .onConflictDoNothing();
  const [created] = await db.select().from(workspaces).where(match);
  if (!created) throw new Error("Personal workspace is unavailable.");
  return created;
}
