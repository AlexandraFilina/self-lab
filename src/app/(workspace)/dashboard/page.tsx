import { ProtectedPage } from "@/features/auth/components/server-boundary";
import { LocalDataBoundary } from "@/components/local-data-boundary";
import { t } from "@/i18n";
import type { Metadata } from "next";
import { Dashboard } from "@/features/dashboard/components/dashboard";
export const metadata: Metadata = { title: t.pages.dashboard };
export default function DashboardPage() {
  return (
    <ProtectedPage>
      <LocalDataBoundary>
        <Dashboard />
      </LocalDataBoundary>
    </ProtectedPage>
  );
}
