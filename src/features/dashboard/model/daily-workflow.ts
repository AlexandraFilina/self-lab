import { addDays, dayOffset } from "@/lib/dates";
import { endDate } from "@/features/experiments/model/analytics";
import type { Experiment } from "@/features/experiments/model/types";

export function getDailyWorkflow(experiments: readonly Experiment[], today: string) {
  const yesterday = addDays(today, -1);
  const rows = experiments
    .filter((experiment) => experiment.source === "user" && experiment.status === "active")
    .map((experiment) => {
      const lastDay = endDate(experiment);
      const todayEntry = experiment.entries.find((entry) => entry.observedDate === today);
      const yesterdayEntry = experiment.entries.find((entry) => entry.observedDate === yesterday);
      const canCheckInToday = today >= experiment.startDate && today <= lastDay;
      const canCheckInYesterday = yesterday >= experiment.startDate && yesterday <= lastDay;
      const elapsedDays = Math.min(
        experiment.durationDays,
        Math.max(0, dayOffset(experiment.startDate, today) + 1),
      );
      return {
        experiment,
        todayEntry,
        yesterdayEntry,
        defaultEntry: canCheckInToday ? todayEntry : yesterdayEntry,
        elapsedDays,
        elapsedPercent: Math.round((elapsedDays / experiment.durationDays) * 100),
        canCheckInToday,
        canCheckInYesterday,
        windowComplete: today > lastDay,
      };
    });
  const ordered = [
    ...rows.filter((row) => !row.todayEntry),
    ...rows.filter((row) => row.todayEntry),
  ];
  const available = ordered.filter((row) => row.canCheckInToday);
  const checkedIn = available.filter((row) => row.todayEntry).length;
  return {
    rows: ordered,
    today,
    yesterday,
    total: available.length,
    checkedIn,
    caughtUp:
      available.length > 0 &&
      checkedIn === available.length &&
      !rows.some((row) => row.windowComplete),
    hasTargetDecisions: rows.some((row) => row.windowComplete),
  };
}
