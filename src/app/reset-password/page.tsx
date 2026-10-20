import type { Metadata } from "next";
import { t } from "@/i18n";
import { Suspense } from "react";
import { AuthFormWithMail } from "@/features/auth/components/server-boundary";
export const metadata: Metadata = { title: t.auth.resetTitle, referrer: "no-referrer" };
export default function Page() {
  return (
    <Suspense>
      <AuthFormWithMail mode="reset-password" />
    </Suspense>
  );
}
