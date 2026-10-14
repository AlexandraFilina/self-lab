import type { MetricId } from "./types";

export const METRICS: Record<MetricId, { label: string; color: string; description: string }> = {
  sleep: { label: "Sleep quality", color: "#7765df", description: "How well did you sleep?" },
  mood: { label: "Mood", color: "#48a899", description: "How did you feel today?" },
  productivity: {
    label: "Productivity",
    color: "#d39753",
    description: "How productive was your day?",
  },
};
