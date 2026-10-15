import { dayOffset } from "@/lib/dates";

export interface ChartObservation {
  date: string;
  value: number;
}
export interface ChartSegment {
  kind: "solid" | "dashed";
  from: ChartObservation;
  to: ChartObservation;
}
export function buildChartSegments(observations: readonly ChartObservation[]): ChartSegment[] {
  const segments: ChartSegment[] = [];
  for (let index = 1; index < observations.length; index++) {
    const from = observations[index - 1],
      to = observations[index];
    const days = dayOffset(from.date, to.date);
    if (!Number.isFinite(days) || days < 1)
      throw new Error("Chart observations must have valid, unique, ascending calendar dates.");
    segments.push({ kind: days === 1 ? "solid" : "dashed", from, to });
  }
  return segments;
}
