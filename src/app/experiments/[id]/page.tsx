import { LocalDataBoundary } from "@/components/local-data-boundary";
import { t } from "@/i18n";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ExperimentDetails } from "@/features/experiments/components/experiment-details";
import { SAMPLE_EXPERIMENT_IDS } from "@/features/experiments/data/mock-experiments";

export const metadata: Metadata = { title: t.pages.details };
export function generateStaticParams() {
  return SAMPLE_EXPERIMENT_IDS.map((id) => ({ id }));
}
async function ExperimentRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <LocalDataBoundary>
      <ExperimentDetails id={id} />
    </LocalDataBoundary>
  );
}
export default function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <p className="muted" role="status">
          {t.pages.loadingExperiment}
        </p>
      }
    >
      <ExperimentRoute params={params} />
    </Suspense>
  );
}
