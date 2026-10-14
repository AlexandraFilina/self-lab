import { t } from "@/i18n";
import type { MetricId } from "./types";

export const METRICS: Record<MetricId, { label: string; color: string; description: string }> = {
  sleep: { ...t.metrics.sleep, color: "#7765df" },
  mood: { ...t.metrics.mood, color: "#48a899" },
  productivity: { ...t.metrics.productivity, color: "#d39753" },
  energy: { ...t.metrics.energy, color: "#a27ab7" },
};
