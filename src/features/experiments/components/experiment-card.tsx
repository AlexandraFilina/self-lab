"use client";

import { t } from "@/i18n";

import { useExperiments } from "@/features/experiments/context/experiments-provider";
import Link from "next/link";
import type { Experiment } from "@/features/experiments/model/types";
import { formatDate } from "@/lib/format";
import { endDate, getProgress, observedWindowDays } from "@/features/experiments/model/analytics";
import { metricLabel, metricColor } from "@/features/experiments/model/metrics";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icon";

export function StatusBadge({ experiment }: { experiment: Experiment }) {
  const { referenceDate } = useExperiments();
  const { completed } = getProgress(experiment, referenceDate);
  return (
    <span className={`status-badge ${completed ? "status-completed" : "status-active"}`}>
      <span />
      {completed ? t.common.completed : t.common.active}
    </span>
  );
}

export function ExperimentProgress({ experiment }: { experiment: Experiment }) {
  const { referenceDate } = useExperiments();
  const progress = getProgress(experiment, referenceDate);
  const elapsedDays = progress.completed
    ? observedWindowDays(experiment)
    : Math.min(progress.total, progress.elapsedDays);
  return (
    <div className="experiment-progress">
      <div className="progress-caption">
        <strong>{t.common.dayOf(elapsedDays, progress.total)}</strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={t.dailyWorkflow.progress}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={elapsedDays}
      >
        <div style={{ width: `${(elapsedDays / progress.total) * 100}%` }} />
      </div>
    </div>
  );
}

export function ExperimentCard({ experiment }: { experiment: Experiment }) {
  const { referenceDate } = useExperiments();
  const progress = getProgress(experiment, referenceDate);
  return (
    <Card className="experiment-card">
      <div className="section-heading experiment-card-heading">
        <div className="card-badges">
          <StatusBadge experiment={experiment} />
          {experiment.source === "sample" && (
            <span className="neutral-badge">{t.common.sample}</span>
          )}
        </div>
      </div>
      <h2>
        <Link href={`/experiments/${experiment.id}`}>{experiment.title}</Link>
      </h2>
      <p className="experiment-hypothesis">{experiment.question}</p>
      <div className="metric-tags">
        {experiment.metrics.map((metric) => (
          <span key={metric.id}>
            <i style={{ backgroundColor: metricColor(metric) }} />
            {metricLabel(metric)}
          </span>
        ))}
      </div>
      {progress.completed ? (
        <p className="experiment-observation-count">
          {t.experiments.observationCount(progress.recorded)}
        </p>
      ) : (
        <ExperimentProgress experiment={experiment} />
      )}
      <div className="experiment-card-footer">
        <span>
          {formatDate(experiment.startDate)} — {formatDate(endDate(experiment))}
        </span>
        <Link href={`/experiments/${experiment.id}`} className="text-link">
          {t.common.viewDetails}
          <Icon name="arrow" />
        </Link>
      </div>
    </Card>
  );
}
