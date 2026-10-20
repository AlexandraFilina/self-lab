import { Suspense, type ReactNode } from "react";
import { requireAccount, redirectAuthenticated } from "@/server/auth/session";
import { t } from "@/i18n";
import { connection } from "next/server";
import { localAuthMailAvailable } from "@/server/auth/mail";
import { AuthForm, type AuthMode } from "./auth-form";
export async function AuthFormWithMail({ mode }: { mode: AuthMode }) {
  await connection();
  return <AuthForm mode={mode} mailAvailable={localAuthMailAvailable()} />;
}
async function RequireSession({ children }: { children: ReactNode }) {
  await requireAccount();
  return children;
}
async function RequireGuest({ children }: { children: ReactNode }) {
  await redirectAuthenticated();
  return children;
}
const fallback = (
  <p className="muted" role="status">
    {t.auth.loading}
  </p>
);
export function ProtectedPage({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={fallback}>
      <RequireSession>{children}</RequireSession>
    </Suspense>
  );
}
export function GuestPage({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={fallback}>
      <RequireGuest>{children}</RequireGuest>
    </Suspense>
  );
}
