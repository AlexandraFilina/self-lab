"use client";
import Link from "next/link";
import { t } from "@/i18n";
import { formatCount, formatDate } from "@/lib/format";
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
        <div className="detail-actions">
          <DailyEntryButton experiment={experiment} />
          {experiment.status === "active" && (
            <ExperimentLifecycle experiment={experiment} compact />
          )}
        </div>
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
            {progress.completed
              ? t.experiments.completedText
              : experiment.entries.length === 0
                ? t.onboarding.startToday
                : t.experiments.progressText}
          </p>
        </div>
        <ExperimentProgress experiment={experiment} />
      </Card>
      {(progress.completed || progress.windowComplete) && (
        <ExperimentLifecycle experiment={experiment} />
      )}
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
      <ResultsComparison experiment={experiment} completed={progress.completed} />
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
      <DailyObservations key={`${experiment.id}:${experiment.status}`} experiment={experiment} />
    </>
  );
}
