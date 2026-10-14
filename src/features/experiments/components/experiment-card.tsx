"use client";

import { useExperiments } from "@/features/experiments/context/experiments-provider";
import Link from "next/link";
import type { Experiment } from "@/features/experiments/model/types";
import { formatCount, formatDate } from "@/lib/format";
import { endDate, getProgress } from "@/features/experiments/model/analytics";
import { METRICS } from "@/features/experiments/model/metrics";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icon";

export function StatusBadge({ experiment }: { experiment: Experiment }) {
  const { referenceDate } = useExperiments();
  const { completed } = getProgress(experiment, referenceDate);
  return (
    <span className={`status-badge ${completed ? "status-completed" : "status-active"}`}>
      <span />
      {completed ? "Completed" : "In progress"}
    </span>
  );
}

export function ExperimentProgress({ experiment }: { experiment: Experiment }) {
  const { referenceDate } = useExperiments();
  const progress = getProgress(experiment, referenceDate);
  return (
    <div className="experiment-progress">
      <div className="progress-caption">
        <span>Days checked in</span>
        <strong>
          {progress.recorded}
          <span> / {progress.total}</span>
        </strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Days checked in"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.recorded}
      >
        <div style={{ width: `${progress.percent}%` }} />
      </div>
    </div>
  );
}

export function ExperimentCard({ experiment }: { experiment: Experiment }) {
  const { referenceDate } = useExperiments();
  const progress = getProgress(experiment, referenceDate);
  return (
    <Card className="experiment-card">
      <div className="section-heading">
        <span className="icon-tile">
          <Icon
            name={
              experiment.id === "early-sleep"
                ? "moon"
                : experiment.id === "morning-walk"
                  ? "leaf"
                  : "flask"
            }
          />
        </span>
        <StatusBadge experiment={experiment} />
      </div>
      <h2>
        <Link href={`/experiments/${experiment.id}`}>{experiment.title}</Link>
      </h2>
      <p className="experiment-hypothesis">{experiment.hypothesis}</p>
      <div className="metric-tags">
        {experiment.metrics.map((metric) => (
          <span key={metric}>
            <i style={{ backgroundColor: METRICS[metric].color }} />
            {METRICS[metric].label}
          </span>
        ))}
      </div>
      <ExperimentProgress experiment={experiment} />
      <div className="card-meta">
        <span>
          <Icon name="calendar" />
          {formatCount(progress.total, "day")} · {experiment.durationA} + {experiment.durationB}
        </span>
        <span>
          {progress.completed
            ? "Ready to compare"
            : `Period ${progress.period} · day ${progress.periodDay}`}
        </span>
      </div>
      <div className="experiment-card-footer">
        <span>
          {formatDate(experiment.startDate)} — {formatDate(endDate(experiment))}
        </span>
        <Link href={`/experiments/${experiment.id}`} className="text-link">
          View details
          <Icon name="arrow" />
        </Link>
      </div>
    </Card>
  );
}
