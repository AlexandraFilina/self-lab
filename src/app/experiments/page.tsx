import { LocalDataBoundary } from "@/components/local-data-boundary";
import { t } from "@/i18n";
import type { Metadata } from "next";
import { ExperimentsList } from "@/features/experiments/components/experiments-list";
export const metadata: Metadata = { title: t.pages.experiments };
export default function ExperimentsPage() {
  return (
    <LocalDataBoundary>
      <ExperimentsList />
    </LocalDataBoundary>
  );
}
