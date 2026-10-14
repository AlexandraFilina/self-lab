import type { Metadata } from "next";
import { Suspense } from "react";
import { ExperimentDetails } from "@/features/experiments/components/experiment-details";
import { MOCK_EXPERIMENTS } from "@/features/experiments/data/mock-experiments";

export const metadata: Metadata = { title: "Experiment details" };
export function generateStaticParams() {
  return MOCK_EXPERIMENTS.map(({ id }) => ({ id }));
}
async function ExperimentRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExperimentDetails id={id} />;
}
export default function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <p className="muted" role="status">
          Loading experiment…
        </p>
      }
    >
      <ExperimentRoute params={params} />
    </Suspense>
  );
}
