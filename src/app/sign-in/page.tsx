import type { Metadata } from "next";
import { t } from "@/i18n";
import { GuestPage } from "@/features/auth/components/server-boundary";
import { AuthForm } from "@/features/auth/components/auth-form";
export const metadata: Metadata = { title: t.auth.signIn, referrer: "no-referrer" };
export default function Page() {
  return (
    <GuestPage>
      <AuthForm mode="sign-in" />
    </GuestPage>
  );
}
