"use client";
import Link from "next/link";
import { t } from "@/i18n";
import { formatCount, formatDate } from "@/lib/format";
import { endDate, getProgress } from "../model/analytics";
import { METRICS } from "../model/metrics";
import { useExperiments } from "../context/experiments-provider";
import { DailyEntryButton } from "./daily-entry";
import { ExperimentProgress, StatusBadge } from "./experiment-card";
import { Icon } from "@/components/icon";
import { MetricChart } from "./metric-chart";
import { ResultsComparison } from "./results-comparison";
import { Card, cn } from "@/components/ui";

export function ExperimentDetails({ id }: { id: string }) {
  const { experiments, referenceDate } = useExperiments();
  const experiment = experiments.find((item) => item.id === id);
  if (!experiment)
    return (
      <Card className="empty-state">
        <span className="icon-tile">
          <Icon name="flask" />
        </span>
        <h1>{t.experiments.missing}</h1>
        <p>{t.experiments.missingText}</p>
        <Link href="/experiments" className="button button-primary">
          {t.common.back}
        </Link>
      </Card>
    );
  const progress = getProgress(experiment, referenceDate);
  return (
    <>
      <Link href="/experiments" className="back-link">
        {t.common.back}
      </Link>
      <div className="detail-heading">
        <div>
          <div className="detail-eyebrow">
            <span className="eyebrow">{t.experiments.daily}</span>
            <StatusBadge experiment={experiment} />
            {experiment.source === "sample" && (
              <span className="neutral-badge">{t.common.sample}</span>
            )}
          </div>
          <h1>{experiment.title}</h1>
          <p className="detail-date">
            <Icon name="calendar" />
            {formatDate(experiment.startDate)} — {formatDate(endDate(experiment))} ·{" "}
            {formatCount(progress.total, "day")}
          </p>
        </div>
        <DailyEntryButton experiment={experiment} />
      </div>
      <Card className="hypothesis-card">
        <span className="icon-tile small">
          <Icon name="sparkles" />
        </span>
        <div>
          <span className="eyebrow">{t.experiments.question}</span>
          <p>{experiment.question}</p>
        </div>
      </Card>
      <div className="detail-conditions">
        <Card className="detail-condition detail-condition-current">
          <div className="condition-label">
            <span className="period-letter">
              <Icon name="leaf" />
            </span>
            <h2>{t.experiments.habit}</h2>
          </div>
          <p>{experiment.habit}</p>
        </Card>
        <Card className="detail-condition">
          <div className="condition-label">
            <span className="period-letter">
              <Icon name="chart" />
            </span>
            <h2>{t.experiments.method}</h2>
          </div>
          <p>{t.experiments.methodText}</p>
        </Card>
      </div>
      <Card className="detail-progress-card">
        <div>
          <h2>
            {progress.completed
              ? t.experiments.completed
              : t.common.dayOf(progress.day, progress.total)}
          </h2>
          <p className="muted">
            {progress.completed ? t.experiments.completedText : t.experiments.progressText}
          </p>
        </div>
        <ExperimentProgress experiment={experiment} />
      </Card>
      <Card className="detail-chart-card">
        <div className="section-heading">
          <div>
            <h2>{t.experiments.trend}</h2>
            <p className="muted">{t.experiments.trendText}</p>
          </div>
          <span className="neutral-badge">
            {experiment.source === "sample" ? t.common.sample : t.common.local}
          </span>
        </div>
        {experiment.source === "sample" && (
          <p className="field-hint">{t.experiments.sampleNotice}</p>
        )}
        <MetricChart experiment={experiment} />
      </Card>
      <ResultsComparison experiment={experiment} />
      {experiment.legacy && (
        <Card className="legacy-card">
          <h2>{t.experiments.legacy}</h2>
          <p className="muted">{t.experiments.legacyText}</p>
          <details className="calculation-details">
            <summary>{t.experiments.original}</summary>
            <p>
              <strong>{t.experiments.usual}:</strong> {experiment.legacy.conditionA}
            </p>
            <p>
              <strong>{t.experiments.changed}:</strong> {experiment.legacy.conditionB}
            </p>
          </details>
        </Card>
      )}
      <Card className="entries-card">
        <div className="section-heading">
          <div>
            <h2>{t.experiments.entries}</h2>
            <p className="muted">{t.experiments.context}</p>
          </div>
          <span className="neutral-badge">{formatCount(experiment.entries.length, "entry")}</span>
        </div>
        {experiment.entries.length === 0 ? (
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
                    <th key={metric} scope="col">
                      {METRICS[metric].label}
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
                      <td key={metric}>
                        {entry.values[metric] === undefined ? (
                          "—"
                        ) : (
                          <>
                            {entry.values[metric]}
                            <span className="score-denominator"> / 10</span>
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
        )}
      </Card>
    </>
  );
}
