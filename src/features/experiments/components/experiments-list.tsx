"use client";

import Link from "next/link";
import { useState } from "react";
import { getProgress } from "@/features/experiments/model/analytics";
import type { ExperimentStatus } from "@/features/experiments/model/types";
import { useExperiments } from "@/features/experiments/context/experiments-provider";
import { ExperimentCard } from "./experiment-card";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { Card, cn } from "@/components/ui";

export function ExperimentsList() {
  const { experiments, referenceDate } = useExperiments();
  const [filter, setFilter] = useState<ExperimentStatus | "all">("all");
  const activeCount = experiments.filter(
    (experiment) => !getProgress(experiment, referenceDate).completed,
  ).length;
  const filters = [
    { id: "all" as const, label: "All", count: experiments.length },
    { id: "active" as const, label: "In progress", count: activeCount },
    { id: "completed" as const, label: "Completed", count: experiments.length - activeCount },
  ];
  const visible = experiments.filter(
    (experiment) =>
      filter === "all" ||
      (getProgress(experiment, referenceDate).completed ? "completed" : "active") === filter,
  );
  return (
    <>
      <PageHeading
        eyebrow="FROM QUESTION TO OBSERVATION"
        title="My experiments"
        description="Small changes that help you understand yourself."
        action={
          <Link href="/experiments/new" className="button button-primary">
            <Icon name="plus" />
            New experiment
          </Link>
        }
      />
      <div className="list-toolbar">
        <div className="filter-tabs" role="group" aria-label="Filter by status">
          {filters.map((item) => (
            <button
              key={item.id}
              className={cn("filter-tab", filter === item.id && "filter-selected")}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span>{item.count}</span>
            </button>
          ))}
        </div>
        <span className="muted">Demonstration data</span>
      </div>
      {visible.length ? (
        <div className="experiments-grid">
          {visible.map((experiment) => (
            <ExperimentCard key={experiment.id} experiment={experiment} />
          ))}
        </div>
      ) : (
        <Card className="empty-state">
          <Icon name="flask" />
          <h2>No experiments here yet</h2>
          <p>Try another filter or start a new experiment.</p>
          <Link href="/experiments/new" className="button button-primary">
            New experiment
          </Link>
        </Card>
      )}
      <div className="list-bottom-note">
        <Icon name="info" />
        <p>
          One experiment, one question. Start with a change that fits easily into your daily life.
        </p>
      </div>
    </>
  );
}
