import { Suspense } from "react";
import { requireAccount } from "@/server/auth/session";
import { AccountControls } from "@/features/auth/components/account-controls";
import { t } from "@/i18n";
async function Account() {
  const account = await requireAccount();
  return <AccountControls {...account} />;
}
export default function Page() {
  return (
    <Suspense fallback={<p role="status">{t.auth.loading}</p>}>
      <Account />
    </Suspense>
  );
}
