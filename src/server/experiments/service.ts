import "server-only";
import { authenticatedRepository } from "../auth/authorized-repository";
import { getAuth } from "../auth";
import { getDatabase } from "../db/client";
export function getWorkspaceRepository(request: Request) {
  return authenticatedRepository(request.headers, getAuth(), getDatabase());
}
