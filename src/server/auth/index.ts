import "server-only";
import { getDatabase } from "../db/client";
import { AppError } from "@/lib/errors";
import { createAuth, type SelfLabAuth } from "./config";
import { localAuthMailAvailable } from "./mail";
let instance: SelfLabAuth | undefined;
export function getAuth() {
  const secret = process.env.BETTER_AUTH_SECRET,
    baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || secret === "CHANGE_ME" || !baseURL)
    throw new AppError("backendConfiguration");
  if (process.env.VERCEL_ENV === "production") {
    try {
      const url = new URL(baseURL);
      if (
        url.protocol !== "https:" ||
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      throw new AppError("backendConfiguration");
    }
  }
  return (instance ??= createAuth(getDatabase(), {
    secret,
    baseURL,
    mailEnabled: localAuthMailAvailable(),
  }));
}
