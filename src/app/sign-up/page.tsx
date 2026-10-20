import type { Metadata } from "next";
import { t } from "@/i18n";
import { GuestPage, AuthFormWithMail } from "@/features/auth/components/server-boundary";
export const metadata: Metadata = { title: t.auth.signUp, referrer: "no-referrer" };
export default function Page() {
  return (
    <GuestPage>
      <AuthFormWithMail mode="sign-up" />
    </GuestPage>
  );
}
