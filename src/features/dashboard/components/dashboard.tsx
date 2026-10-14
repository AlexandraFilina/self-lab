"use client";

import Link from "next/link";
import { formatCount, formatDate } from "@/lib/format";
import { endDate, getProgress } from "@/features/experiments/model/analytics";
import { useExperiments } from "@/features/experiments/context/experiments-provider";
import { DailyEntryButton } from "@/features/experiments/components/daily-entry";
import { ExperimentProgress, StatusBadge } from "@/features/experiments/components/experiment-card";
import { Icon, type IconName } from "@/components/icon";
import { MetricChart } from "@/features/experiments/components/metric-chart";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui";

export function Dashboard() {
  const { experiments, referenceDate } = useExperiments();
  const active = experiments.filter(
    (experiment) => !getProgress(experiment, referenceDate).completed,
  );
  const current = active[0];
  const progress = current ? getProgress(current, referenceDate) : null;
  const todayEntry = current?.entries.some((entry) => entry.date === referenceDate);
  const stats: { label: string; value: number; caption: string; icon: IconName }[] = [
    {
      label: "Active experiments",
      value: active.length,
      caption: "Finding your rhythm",
      icon: "flask",
    },
    {
      label: "Daily check-ins",
      value: experiments.reduce((sum, item) => sum + item.entries.length, 0),
      caption: "Every entry is an observation",
      icon: "calendar",
    },
    {
      label: "Completed experiments",
      value: experiments.length - active.length,
      caption: "Ready to compare",
      icon: "chart",
    },
  ];

  return (
    <>
      <PageHeading
        eyebrow="YOUR PERSONAL OVERVIEW"
        title="Hello, curious mind"
        description="Discover what helps you feel a little better."
        action={
          <Link href="/experiments/new" className="button button-primary">
            <Icon name="plus" />
            New experiment
          </Link>
        }
      />
      <div className="welcome-note">
        <Icon name="sun" />
        <span>A small observation today. A little more clarity tomorrow.</span>
        <time dateTime={referenceDate}>
          {formatDate(referenceDate, { day: "numeric", month: "long" })} · demo date
        </time>
      </div>
      <div className="stats-grid">
        {stats.map((stat) => (
          <Card key={stat.label} className="stat-card">
            <div className="stat-top">
              <span>{stat.label}</span>
              <Icon name={stat.icon} />
            </div>
            <strong className="stat-value">
              {stat.value}
              <span className="stat-caption">{stat.caption}</span>
            </strong>
          </Card>
        ))}
      </div>
      <div className="section-heading dashboard-section">
        <h2>In focus</h2>
        <Link href="/experiments" className="text-link">
          All experiments
          <Icon name="arrow" />
        </Link>
      </div>
      {current && progress ? (
        <>
          <div className="focus-grid">
            <Card className="focus-card">
              <div className="focus-orbit" aria-hidden="true">
                <div />
                <div />
                <span>
                  <Icon name="moon" />
                </span>
              </div>
              <div className="section-heading">
                <span className="eyebrow">CURRENT EXPERIMENT</span>
                <StatusBadge experiment={current} />
              </div>
              <h2>{current.title}</h2>
              <p className="focus-hypothesis">{current.hypothesis}</p>
              <div className="period-cards">
                <div
                  className={
                    progress.period === "A" ? "period-mini period-selected" : "period-mini"
                  }
                >
                  <span className="period-letter">A</span>
                  <div>
                    <strong>Usual routine</strong>
                    <small>
                      {formatCount(current.durationA, "day")}
                      {progress.period === "A" ? " · current" : " · finished"}
                    </small>
                  </div>
                  {progress.period === "B" && <Icon name="check" />}
                </div>
                <div
                  className={
                    progress.period === "B" ? "period-mini period-selected" : "period-mini"
                  }
                >
                  <span className="period-letter">B</span>
                  <div>
                    <strong>New conditions</strong>
                    <small>
                      {formatCount(current.durationB, "day")}
                      {progress.period === "B" ? " · current" : " · up next"}
                    </small>
                  </div>
                </div>
              </div>
              <ExperimentProgress experiment={current} />
              <div className="focus-footer">
                <span>
                  <Icon name="calendar" />
                  {formatDate(current.startDate)} — {formatDate(endDate(current))}
                </span>
                <Link href={`/experiments/${current.id}`} className="text-link">
                  View experiment
                  <Icon name="arrow" />
                </Link>
              </div>
            </Card>
            <Card className="today-card">
              <span className="icon-tile">
                <Icon name={todayEntry ? "check" : "sun"} />
              </span>
              <span className="eyebrow">YOUR NEXT STEP</span>
              <h2>{todayEntry ? "Day checked in" : "A moment for yourself"}</h2>
              <p>
                {todayEntry
                  ? "Thanks for checking in. You can edit your entry if your assessment changes."
                  : "Reflect on your day. Even ordinary days help you see the bigger picture."}
              </p>
              <div className="today-period">
                <span>Period {progress.period}</span>
                <strong>
                  Day {progress.periodDay}
                  <small> of {progress.periodDuration}</small>
                </strong>
              </div>
              <DailyEntryButton experiment={current} compact />
              <small className="today-footnote">Demo session · resets on reload</small>
            </Card>
          </div>
          <div className="dashboard-bottom">
            <Card className="trend-card">
              <div className="section-heading">
                <div>
                  <h2>The rhythm of your days</h2>
                  <p className="muted">Daily scores in your current experiment</p>
                </div>
                <span className="neutral-badge">1–10</span>
              </div>
              <MetricChart experiment={current} />
            </Card>
            <Card className="reflection-card">
              <span className="icon-tile">
                <Icon name="sparkles" />
              </span>
              <p className="eyebrow">A BETTER EXPERIMENT</p>
              <h2>
                Curiosity
                <br />
                over perfection
              </h2>
              <p>
                Check in at around the same time each day. Note the context: stress, workload, or
                anything unusual.
              </p>
              <div className="reflection-divider" />
              <p className="reflection-bottom">
                We compare observations.
                <br />
                They help reveal differences, but do not establish their cause.
              </p>
            </Card>
          </div>
        </>
      ) : (
        <Card className="empty-state">
          <span className="icon-tile">
            <Icon name="flask" />
          </span>
          <h2>Time for a new question</h2>
          <p>Start an experiment with one small change.</p>
          <Link href="/experiments/new" className="button button-primary">
            <Icon name="plus" />
            New experiment
          </Link>
        </Card>
      )}
    </>
  );
}
