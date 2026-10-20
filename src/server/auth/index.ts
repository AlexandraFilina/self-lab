import "server-only";
import { getDatabase } from "../db/client";
import { AppError } from "@/lib/errors";
import { createAuth, type SelfLabAuth } from "./config";
let instance: SelfLabAuth | undefined;
export function getAuth() {
  const secret = process.env.BETTER_AUTH_SECRET,
    baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || secret === "CHANGE_ME" || !baseURL)
    throw new AppError("backendConfiguration");
  return (instance ??= createAuth(getDatabase(), { secret, baseURL }));
}
