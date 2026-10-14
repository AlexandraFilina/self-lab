import { LocalDataBoundary } from "@/components/local-data-boundary";
import { t } from "@/i18n";
import type { Metadata } from "next";
import { Dashboard } from "@/features/dashboard/components/dashboard";
export const metadata: Metadata = { title: t.pages.dashboard };
export default function DashboardPage() {
  return (
    <LocalDataBoundary>
      <Dashboard />
    </LocalDataBoundary>
  );
}
