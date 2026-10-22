"use client";

import Link from "next/link";
import { t } from "@/i18n";
import { Icon } from "@/components/icon";
import { Card } from "@/components/ui";
import { useExperiments } from "@/features/experiments/context/experiments-provider";
import { NewExperimentForm } from "@/features/experiments/components/new-experiment-form";
import { needsOnboarding } from "@/features/experiments/model/onboarding";
import { getDailyWorkflow } from "../model/daily-workflow";
import { TodaysCheckIns } from "./todays-check-ins";
import { DashboardTrends } from "./dashboard-trends";
import { DailyReflectionCard } from "@/features/reflections/components/daily-reflection-card";

export function Dashboard() {
  const { experiments, referenceDate } = useExperiments();
  if (needsOnboarding(experiments))
    return (
      <>
        <DailyReflectionCard key={referenceDate} />
        <NewExperimentForm onboarding />
        <DashboardTrends />
      </>
    );
  const workflow = getDailyWorkflow(experiments, referenceDate);

  return (
    <>
      <div className="page-heading">
        <h1>{t.dashboard.title}</h1>
        <div className="heading-action">
          <Link href="/experiments/new" className="button button-primary">
            <Icon name="plus" />
            {t.common.newExperiment}
          </Link>
        </div>
      </div>
      <DailyReflectionCard key={referenceDate} />
      {workflow.rows.length ? (
        <TodaysCheckIns workflow={workflow} />
      ) : (
        <Card className="empty-state">
          <span className="icon-tile">
            <Icon name="flask" />
          </span>
          <h2>{t.dashboard.empty}</h2>
          <p>{t.dashboard.emptyText}</p>
          <Link href="/experiments/new" className="button button-primary">
            <Icon name="plus" />
            {t.common.newExperiment}
          </Link>
        </Card>
      )}
      <DashboardTrends />
    </>
  );
}
