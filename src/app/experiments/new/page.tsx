import type { Metadata } from "next";
import { NewExperimentForm } from "@/features/experiments/components/new-experiment-form";
export const metadata: Metadata = { title: "New experiment" };
export default function NewExperimentPage() {
  return <NewExperimentForm />;
}
