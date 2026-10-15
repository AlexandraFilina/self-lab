import { t } from "@/i18n";
import { formatCount, formatDate } from "@/lib/format";
import type { Experiment } from "../model/types";
import { metricLabel } from "../model/metrics";
import { DailyEntryButton } from "./daily-entry";
import { Icon } from "@/components/icon";
import { Card, cn } from "@/components/ui";

export function DailyObservations({
  experiment,
  completed,
}: {
  experiment: Experiment;
  completed: boolean;
}) {
  const content =
    experiment.entries.length === 0 ? (
      <div className="entries-empty">
        <Icon name="calendar" />
        <p>{t.experiments.noEntries}</p>
      </div>
    ) : (
      <div className="table-scroll">
        <table className="entries-table">
          <caption className="sr-only">{t.experiments.entriesCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{t.common.date}</th>
              <th scope="col">{t.experiments.status}</th>
              {experiment.metrics.map((metric) => (
                <th key={metric.id} scope="col">
                  {metricLabel(metric)}
                </th>
              ))}
              <th scope="col">{t.common.note}</th>
              <th scope="col">{t.experiments.actions}</th>
            </tr>
          </thead>
          <tbody>
            {[...experiment.entries].reverse().map((entry) => (
              <tr key={entry.id}>
                <th scope="row">
                  <time dateTime={entry.observedDate}>{formatDate(entry.observedDate)}</time>
                </th>
                <td>
                  <span
                    className={cn(
                      "habit-table-status",
                      entry.habitStatus === "done" && "habit-table-done",
                    )}
                  >
                    {entry.habitStatus === "done"
                      ? t.common.done
                      : entry.habitStatus === "not_done"
                        ? t.common.notDone
                        : t.common.notRecorded}
                  </span>
                </td>
                {experiment.metrics.map((metric) => (
                  <td key={metric.id}>
                    {entry.values[metric.id] === undefined ? (
                      "—"
                    ) : (
                      <>
                        {entry.values[metric.id]}
                        <span className="score-denominator"> / {metric.scale.max}</span>
                      </>
                    )}
                  </td>
                ))}
                <td className="entry-note-cell">{entry.note || "—"}</td>
                <td>
                  <DailyEntryButton experiment={experiment} date={entry.observedDate} row />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return (
    <Card className="entries-card">
      {completed && experiment.entries.length > 0 ? (
        <details className="observations-disclosure">
          <summary>{t.experiments.viewObservations(experiment.entries.length)}</summary>
          {content}
        </details>
      ) : (
        <>
          <div className="section-heading">
            <div>
              <h2>{t.experiments.entries}</h2>
              <p className="muted">{t.experiments.context}</p>
            </div>
            <span className="neutral-badge">{formatCount(experiment.entries.length, "entry")}</span>
          </div>
          {content}
        </>
      )}
    </Card>
  );
}
