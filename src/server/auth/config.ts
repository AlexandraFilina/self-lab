import "server-only";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { Database } from "../db/client";
import { authSchema } from "../db/auth-schema";
import { personalWorkspace } from "./workspace";
import { sendLocalAuthMail, type SendAuthMail } from "./mail";
import { t } from "@/i18n";

export function createAuth(
  db: Database,
  config: { secret: string; baseURL: string; sendMail?: SendAuthMail; mailEnabled?: boolean },
) {
  const sendMail = config.sendMail ?? sendLocalAuthMail;
  const mailEnabled = config.mailEnabled ?? true;
  // The library generates, hashes, signs, stores, expires and revokes all auth credentials.
  return betterAuth({
    appName: "Self Lab",
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: [new URL(config.baseURL).origin],
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema, transaction: true }),
    logger: { disabled: true },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: true,
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 15 * 60,
      sendResetPassword: mailEnabled
        ? async ({ user, url }) => {
            await sendMail({
              to: user.email,
              subject: t.authMail.resetSubject,
              text: t.authMail.resetBody(url),
            });
          }
        : undefined,
    },
    emailVerification: {
      sendOnSignUp: mailEnabled,
      expiresIn: 60 * 60,
      sendVerificationEmail: mailEnabled
        ? async ({ user, url }) => {
            await sendMail({
              to: user.email,
              subject: t.authMail.verifySubject,
              text: t.authMail.verifyBody(url),
            });
          }
        : undefined,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    advanced: {
      backgroundTasks: {
        handler: (task) => {
          void task.catch(() => console.error("Local authentication mail delivery failed."));
        },
      },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 20 },
        "/request-password-reset": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 5 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: { ...user, email: user.email.trim().toLowerCase(), name: t.auth.defaultName },
          }),
          after: async (user) => {
            await personalWorkspace(db, user.id);
          },
        },
      },
    },
  });
}
export type SelfLabAuth = ReturnType<typeof createAuth>;
