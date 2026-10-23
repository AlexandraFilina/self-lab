"use client";
import Link from "next/link";
import { t } from "@/i18n";
import { formatDate } from "@/lib/format";
import { endDate, getProgress } from "../model/analytics";
import { useExperiments } from "../context/experiments-provider";
import { DailyEntryButton } from "./daily-entry";
import { ExperimentProgress, StatusBadge } from "./experiment-card";
import { Icon } from "@/components/icon";
import { MetricChart } from "./metric-chart";
import { ResultsComparison } from "./results-comparison";
import { ExperimentLifecycle } from "./experiment-lifecycle";
import { DailyObservations } from "./daily-observations";
import { Card } from "@/components/ui";
import { outcomeEntries } from "@/features/reflections/model/analytics";

export function ExperimentDetails({ id }: { id: string }) {
  const { experiments, referenceDate, reflections, globalMetrics } = useExperiments();
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
  const displayExperiment =
    experiment.outcomeSource === "global"
      ? {
          ...experiment,
          metrics: experiment.metrics.map(
            (metric) =>
              globalMetrics.find((item) => item.definition.id === metric.id)?.definition ?? metric,
          ),
        }
      : experiment;
  const analysisExperiment = {
    ...displayExperiment,
    entries: outcomeEntries(displayExperiment, reflections),
  };
  return (
    <>
      <Link href="/experiments" className="back-link">
        {t.common.back}
      </Link>
      <div className="detail-heading">
        <div>
          <div className="detail-eyebrow">
            <StatusBadge experiment={experiment} />
            {experiment.source === "sample" && (
              <span className="neutral-badge">{t.common.sample}</span>
            )}
          </div>
          <h1>{experiment.title}</h1>
          <p className="detail-date">
            <Icon name="calendar" />
            {formatDate(experiment.startDate)} — {formatDate(endDate(experiment))}
          </p>
        </div>
        <div className="detail-actions">
          {experiment.status === "active" && (
            <DailyEntryButton
              experiment={experiment}
              label={t.checkIn.dailyAction}
              showSavedFeedback={false}
            />
          )}
          <ExperimentLifecycle experiment={experiment} compact />
        </div>
      </div>
      <Card className="detail-overview-card">
        <div>
          <span className="eyebrow">{t.experiments.question}</span>
          <p>{experiment.question}</p>
        </div>
        <div>
          <span className="eyebrow">{t.experiments.habit}</span>
          <p>{experiment.habit}</p>
        </div>
      </Card>
      <Card className="detail-progress-card">
        <ExperimentProgress experiment={experiment} />
        <p className="muted">
          {t.experiments.recordedDays(progress.recorded, experiment.durationDays)}
        </p>
      </Card>
      {!progress.completed && progress.windowComplete && (
        <ExperimentLifecycle experiment={experiment} />
      )}
      <Card className="detail-chart-card">
        <h2>{t.experiments.trend}</h2>
        <p className="muted">{t.experiments.trendText}</p>
        <MetricChart experiment={analysisExperiment} />
      </Card>
      <ResultsComparison experiment={analysisExperiment} completed={progress.completed} />
      {experiment.legacy && (
        <Card className="legacy-card">
          <details className="legacy-disclosure">
            <summary>{t.experiments.legacyDetails}</summary>
            <p className="muted">{t.experiments.legacyText}</p>
            <p>
              <strong>{t.experiments.usual}:</strong> {experiment.legacy.conditionA}
            </p>
            <p>
              <strong>{t.experiments.changed}:</strong> {experiment.legacy.conditionB}
            </p>
          </details>
        </Card>
      )}
      <DailyObservations
        key={`${experiment.id}:${experiment.status}`}
        experiment={displayExperiment}
        outcomeEntries={analysisExperiment.entries}
      />
    </>
  );
}
