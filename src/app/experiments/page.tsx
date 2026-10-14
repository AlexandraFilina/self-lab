import type { Metadata } from "next";
import { ExperimentsList } from "@/features/experiments/components/experiments-list";
export const metadata: Metadata = { title: "Experiments" };
export default function ExperimentsPage() {
  return <ExperimentsList />;
}
