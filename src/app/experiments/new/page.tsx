import { LocalDataBoundary } from "@/components/local-data-boundary";
import { t } from "@/i18n";
import type { Metadata } from "next";
import { NewExperimentForm } from "@/features/experiments/components/new-experiment-form";
export const metadata: Metadata = { title: t.common.newExperiment };
export default function NewExperimentPage() {
  return (
    <LocalDataBoundary>
      <NewExperimentForm />
    </LocalDataBoundary>
  );
}
