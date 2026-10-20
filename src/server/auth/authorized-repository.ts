import "server-only";
import { AppError } from "@/lib/errors";
import type { Database } from "../db/client";
import { createPostgresRepository } from "../experiments/postgres-repository";
import { personalWorkspace } from "./workspace";
import type { SelfLabAuth } from "./config";
export async function authenticatedRepository(
  requestHeaders: Headers,
  auth: SelfLabAuth,
  db: Database,
) {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) throw new AppError("unauthorized");
  const workspace = await personalWorkspace(db, session.user.id);
  return createPostgresRepository(db, workspace.id);
}
