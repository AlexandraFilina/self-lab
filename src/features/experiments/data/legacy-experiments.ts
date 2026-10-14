import type {
  LegacyDailyEntry as DailyEntry,
  LegacyExperiment as Experiment,
  MetricId,
} from "../model/types";

function entries(
  start: string,
  count: number,
  durationA: number,
  metrics: MetricId[],
): DailyEntry[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${start}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const isB = index >= durationA;
    const variation = [0, 1, -1, 0, 1, 0, -1][index % 7];
    return {
      id: `sample-${start}-${index}`,
      date: date.toISOString().slice(0, 10),
      values: Object.fromEntries(
        metrics.map((metric, metricIndex) => [
          metric,
          Math.min(10, Math.max(1, 5 + metricIndex + variation + (isB ? 2 : 0))),
        ]),
      ),
      note:
        index === 16
          ? "Woke up more easily and had a calm, focused morning."
          : index === 4
            ? "A busy day; felt a little tired by the evening."
            : "",
    };
  });
}

export const LEGACY_EXPERIMENTS: Experiment[] = [
  {
    id: "early-sleep",
    title: "Early sleep, better days",
    hypothesis:
      "Going to bed before 11 pm may be associated with better sleep, mood, and productivity the next day.",
    conditionA: "Keep my usual routine and go to bed whenever I feel ready.",
    conditionB: "Go to bed before 11 pm and put my phone away 30 minutes earlier.",
    durationA: 14,
    durationB: 14,
    metrics: ["sleep", "mood", "productivity"],
    startDate: "2026-09-24",
    entries: entries("2026-09-24", 19, 14, ["sleep", "mood", "productivity"]),
  },
  {
    id: "less-coffee",
    title: "Less coffee, calmer evenings",
    hypothesis:
      "Avoiding coffee after 2 pm may be associated with better sleep and a steadier mood.",
    conditionA: "Drink coffee at my usual times without restrictions.",
    conditionB: "Choose caffeine-free drinks after 2 pm.",
    durationA: 10,
    durationB: 10,
    metrics: ["sleep", "mood"],
    startDate: "2026-10-09",
    entries: entries("2026-10-09", 4, 10, ["sleep", "mood"]),
  },
  {
    id: "morning-walk",
    title: "Morning walks, a clearer mind",
    hypothesis:
      "A 20-minute walk before work may be associated with a better mood and greater productivity.",
    conditionA: "Start my workday without a walk.",
    conditionB: "Take a 20-minute walk before starting work.",
    durationA: 10,
    durationB: 10,
    metrics: ["mood", "productivity"],
    startDate: "2026-09-01",
    entries: entries("2026-09-01", 20, 10, ["mood", "productivity"]),
  },
];
