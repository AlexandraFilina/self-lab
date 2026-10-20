import { Suspense, type ReactNode } from "react";
import { requireAccount, redirectAuthenticated } from "@/server/auth/session";
import { t } from "@/i18n";
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
