"use client";

import { t } from "@/i18n";

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
    { id: "all" as const, label: t.common.all, count: experiments.length },
    { id: "active" as const, label: t.common.active, count: activeCount },
    {
      id: "completed" as const,
      label: t.common.completed,
      count: experiments.length - activeCount,
    },
  ];
  const visible = experiments.filter(
    (experiment) =>
      filter === "all" ||
      (getProgress(experiment, referenceDate).completed ? "completed" : "active") === filter,
  );
  return (
    <>
      <PageHeading
        title={t.experiments.title}
        action={
          <Link href="/experiments/new" className="button button-primary">
            <Icon name="plus" />
            {t.common.newExperiment}
          </Link>
        }
      />
      <div className="list-toolbar">
        <div className="filter-tabs" role="group" aria-label={t.experiments.filter}>
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
          <h2>{t.experiments.empty}</h2>
          <p>{t.experiments.emptyText}</p>
          <Link href="/experiments/new" className="button button-primary">
            {t.common.newExperiment}
          </Link>
        </Card>
      )}
    </>
  );
}
