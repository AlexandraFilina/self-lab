import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { getDatabase } from "../db/client";
import { createPostgresRepository, ensureWorkspace } from "./postgres-repository";
export async function getWorkspaceRepository() {
  const workspaceId = z.uuid().safeParse(process.env.SELF_LAB_WORKSPACE_ID);
  if (!workspaceId.success) throw new AppError("backendConfiguration");
  const db = getDatabase();
  await ensureWorkspace(db, workspaceId.data);
  return createPostgresRepository(db, workspaceId.data);
}
