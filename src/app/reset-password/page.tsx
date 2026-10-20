import type { Metadata } from "next";
import { t } from "@/i18n";
import { Suspense } from "react";
import { AuthForm } from "@/features/auth/components/auth-form";
export const metadata: Metadata = { title: t.auth.resetTitle, referrer: "no-referrer" };
export default function Page() {
  return (
    <Suspense>
      <AuthForm mode="reset-password" />
    </Suspense>
  );
}
