"use client";

import Link from "next/link";
import { t } from "@/i18n";
import { DailyEntryButton } from "@/features/experiments/components/daily-entry";
import { ExperimentLifecycle } from "@/features/experiments/components/experiment-lifecycle";
import { getDailyWorkflow } from "../model/daily-workflow";

export function TodaysCheckIns({ workflow }: { workflow: ReturnType<typeof getDailyWorkflow> }) {
  return (
    <section className="daily-workflow" aria-labelledby="daily-workflow-heading">
      <div className="section-heading">
        <h2 id="daily-workflow-heading">{t.dailyWorkflow.title}</h2>
        {workflow.total > 0 && (
          <p className="daily-workflow-summary" role="status" aria-atomic="true">
            {t.dailyWorkflow.summary(workflow.checkedIn, workflow.total)}
          </p>
        )}
      </div>
      <ul className="daily-workflow-rows">
        {workflow.rows.map(
          ({
            experiment,
            todayEntry,
            elapsedDays,
            elapsedPercent,
            canCheckInToday,
            canAddYesterday,
            windowComplete,
          }) => (
            <li
              key={experiment.id}
              data-experiment-id={experiment.id}
              className={`daily-workflow-row${todayEntry ? " daily-workflow-checked" : ""}`}
            >
              <div className="daily-workflow-experiment">
                <h3>
                  <Link href={`/experiments/${experiment.id}`}>{experiment.title}</Link>
                </h3>
                {canCheckInToday && (
                  <span className="sr-only">
                    {todayEntry ? t.dailyWorkflow.checked : t.dailyWorkflow.pending}
                  </span>
                )}
                {!canCheckInToday && !windowComplete && (
                  <p className="muted">{t.dailyWorkflow.notStarted}</p>
                )}
                <div className="daily-workflow-progress">
                  <span>{t.common.dayOf(elapsedDays, experiment.durationDays)}</span>
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-label={t.dailyWorkflow.progress}
                    aria-valuemin={0}
                    aria-valuemax={experiment.durationDays}
                    aria-valuenow={elapsedDays}
                  >
                    <div style={{ width: `${elapsedPercent}%` }} />
                  </div>
                </div>
              </div>
              <div className="daily-workflow-actions">
                {canCheckInToday && (
                  <DailyEntryButton
                    experiment={experiment}
                    date={workflow.today}
                    label={todayEntry ? t.common.edit : t.checkIn.check}
                    variant={todayEntry ? "secondary" : "primary"}
                    showSavedFeedback={false}
                  />
                )}
                {canAddYesterday && (
                  <DailyEntryButton
                    experiment={experiment}
                    date={workflow.yesterday}
                    label={t.dailyWorkflow.addYesterday}
                    variant="secondary"
                    showSavedFeedback={false}
                  />
                )}
              </div>
              {windowComplete && <ExperimentLifecycle experiment={experiment} inline />}
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
