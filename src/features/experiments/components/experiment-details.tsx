"use client";

import Link from "next/link";
import { formatCount, formatDate } from "@/lib/format";
import { endDate, getProgress, periodForDate } from "@/features/experiments/model/analytics";
import { METRICS } from "@/features/experiments/model/metrics";
import { useExperiments } from "@/features/experiments/context/experiments-provider";
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
        <h1>Experiment not found</h1>
        <p>
          Check the link. Experiments created in this demo session reset when you reload the page.
        </p>
        <Link href="/experiments" className="button button-primary">
          Back to experiments
        </Link>
      </Card>
    );
  const progress = getProgress(experiment, referenceDate);
  return (
    <>
      <Link href="/experiments" className="back-link">
        ← Back to experiments
      </Link>
      <div className="detail-heading">
        <div>
          <div className="detail-eyebrow">
            <span className="eyebrow">PERSONAL EXPERIMENT</span>
            <StatusBadge experiment={experiment} />
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
          <span className="eyebrow">YOUR HYPOTHESIS</span>
          <p>{experiment.hypothesis}</p>
        </div>
      </Card>
      <div className="detail-conditions">
        {(["A", "B"] as const).map((period) => (
          <Card
            key={period}
            className={cn(
              "detail-condition",
              !progress.completed && progress.period === period && "detail-condition-current",
            )}
          >
            <div className="section-heading">
              <div className="condition-label">
                <span className="period-letter">{period}</span>
                <h2>{period === "A" ? "Usual routine" : "New conditions"}</h2>
              </div>
              <span className="neutral-badge">
                {formatCount(period === "A" ? experiment.durationA : experiment.durationB, "day")}
              </span>
            </div>
            <p>{period === "A" ? experiment.conditionA : experiment.conditionB}</p>
            <span className="condition-status">
              {progress.completed
                ? "Period finished"
                : progress.period === period
                  ? `Current · day ${progress.periodDay} of ${progress.periodDuration}`
                  : period === "A"
                    ? "Period finished"
                    : "Up next"}
            </span>
          </Card>
        ))}
      </div>
      <Card className="detail-progress-card">
        <div>
          <h2>
            {progress.completed
              ? "Both periods finished"
              : `Day ${progress.day} of ${progress.total}`}
          </h2>
          <p className="muted">
            {progress.completed
              ? "Compare the observations you have collected."
              : `You are in period ${progress.period}. Check in at your usual time.`}
          </p>
        </div>
        <ExperimentProgress experiment={experiment} />
      </Card>
      <Card className="detail-chart-card">
        <div className="section-heading">
          <div>
            <h2>Your observations over time</h2>
            <p className="muted">Your daily scores. Missing days are left empty.</p>
          </div>
          <span className="neutral-badge">Demo data</span>
        </div>
        <MetricChart experiment={experiment} />
      </Card>
      <ResultsComparison experiment={experiment} />
      <Card className="entries-card">
        <div className="section-heading">
          <div>
            <h2>Daily check-ins</h2>
            <p className="muted">Context matters just as much as the numbers.</p>
          </div>
          <span className="neutral-badge">
            {formatCount(experiment.entries.length, "entry", "entries")}
          </span>
        </div>
        {experiment.entries.length === 0 ? (
          <div className="entries-empty">
            <Icon name="calendar" />
            <p>Your first check-in will appear here. Start with today.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="entries-table">
              <caption className="sr-only">Daily scores and notes, newest entries first</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Period</th>
                  {experiment.metrics.map((metric) => (
                    <th key={metric} scope="col">
                      {METRICS[metric].label}
                    </th>
                  ))}
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {[...experiment.entries].reverse().map((entry) => (
                  <tr key={entry.id}>
                    <th scope="row">
                      <time dateTime={entry.date}>{formatDate(entry.date)}</time>
                    </th>
                    <td>
                      <span
                        className={cn(
                          "table-period",
                          periodForDate(experiment, entry.date) === "B" && "table-period-b",
                        )}
                      >
                        {periodForDate(experiment, entry.date)}
                      </span>
                    </td>
                    {experiment.metrics.map((metric) => (
                      <td key={metric}>
                        {entry.values[metric] ?? "—"}
                        <span className="score-denominator"> / 10</span>
                      </td>
                    ))}
                    <td className="entry-note-cell">{entry.note || "—"}</td>
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
