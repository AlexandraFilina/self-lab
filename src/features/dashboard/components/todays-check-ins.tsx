"use client";

import Link from "next/link";
import { t } from "@/i18n";
import { Card } from "@/components/ui";
import { useExperiments } from "@/features/experiments/context/experiments-provider";
import { DailyEntryButton } from "@/features/experiments/components/daily-entry";
import { ExperimentLifecycle } from "@/features/experiments/components/experiment-lifecycle";
import { getDailyWorkflow } from "../model/daily-workflow";

export function TodaysCheckIns() {
  const { experiments, referenceDate } = useExperiments();
  const workflow = getDailyWorkflow(experiments, referenceDate);
  if (workflow.rows.length === 0) return null;
  return (
    <Card className="daily-workflow" aria-labelledby="daily-workflow-heading">
      <div className="section-heading">
        <h2 id="daily-workflow-heading">{t.dailyWorkflow.title}</h2>
        {workflow.total > 0 && (
          <p className="daily-workflow-summary" role="status" aria-atomic="true">
            {t.dailyWorkflow.summary(workflow.checkedIn, workflow.total)}
          </p>
        )}
      </div>
      {workflow.caughtUp && (
        <div className="daily-workflow-caught-up" role="status">
          <p>{t.dailyWorkflow.caughtUp}</p>
          <p className="muted">{t.dailyWorkflow.caughtUpHelp}</p>
        </div>
      )}
      {workflow.hasTargetDecisions && <p className="field-hint">{t.dailyWorkflow.targetSummary}</p>}
      <ul className="daily-workflow-rows">
        {workflow.rows.map(
          ({ experiment, todayEntry, canCheckInToday, canAddYesterday, windowComplete }) => (
            <li
              key={experiment.id}
              data-experiment-id={experiment.id}
              className="daily-workflow-row"
            >
              <div className="daily-workflow-experiment">
                <h3>
                  <Link href={`/experiments/${experiment.id}`}>{experiment.title}</Link>
                </h3>
                {canCheckInToday && (
                  <p className="muted">
                    {todayEntry ? t.dailyWorkflow.checked : t.dailyWorkflow.pending}
                  </p>
                )}
                {!canCheckInToday && !windowComplete && (
                  <p className="muted">{t.dailyWorkflow.notStarted}</p>
                )}
              </div>
              <div className="daily-workflow-actions">
                {canCheckInToday && (
                  <DailyEntryButton
                    experiment={experiment}
                    date={workflow.today}
                    label={todayEntry ? t.common.edit : t.checkIn.check}
                    variant={todayEntry ? "secondary" : "primary"}
                  />
                )}
                {canAddYesterday && (
                  <DailyEntryButton
                    experiment={experiment}
                    date={workflow.yesterday}
                    label={t.dailyWorkflow.addYesterday}
                    variant="ghost"
                  />
                )}
              </div>
              {windowComplete && <ExperimentLifecycle experiment={experiment} inline />}
            </li>
          ),
        )}
      </ul>
    </Card>
  );
}
