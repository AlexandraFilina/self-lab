"use client";

import { t } from "@/i18n";

import Link from "next/link";
import { formatCount, formatDate } from "@/lib/format";
import { endDate, getProgress, groupObservations } from "@/features/experiments/model/analytics";
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
  const groups = current ? groupObservations(current.entries) : null;
  const todayEntry = current?.entries.some((entry) => entry.observedDate === referenceDate);
  const stats: { label: string; value: number; caption: string; icon: IconName }[] = [
    {
      label: t.dashboard.active,
      value: active.length,
      caption: t.dashboard.activeCaption,
      icon: "flask",
    },
    {
      label: t.dashboard.entries,
      value: experiments.reduce((sum, item) => sum + item.entries.length, 0),
      caption: t.dashboard.entriesCaption,
      icon: "calendar",
    },
    {
      label: t.dashboard.completed,
      value: experiments.length - active.length,
      caption: t.dashboard.completedCaption,
      icon: "chart",
    },
  ];

  return (
    <>
      <PageHeading
        eyebrow={t.dashboard.eyebrow}
        title={t.dashboard.title}
        description={t.dashboard.description}
        action={
          <Link href="/experiments/new" className="button button-primary">
            <Icon name="plus" />
            {t.common.newExperiment}
          </Link>
        }
      />
      <div className="welcome-note">
        <Icon name="sun" />
        <span>{t.dashboard.welcome}</span>
        <time dateTime={referenceDate}>
          {formatDate(referenceDate, { day: "numeric", month: "long" })}
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
        <h2>{t.dashboard.focus}</h2>
        <Link href="/experiments" className="text-link">
          {t.dashboard.all}
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
                <span className="eyebrow">{t.dashboard.current}</span>
                <div className="card-badges">
                  <StatusBadge experiment={current} />
                  {current.source === "sample" && (
                    <span className="neutral-badge">{t.common.sample}</span>
                  )}
                </div>
              </div>
              <h2>{current.title}</h2>
              <p className="focus-hypothesis">{current.question}</p>
              <div className="period-cards">
                <div className="period-mini period-selected">
                  <span className="period-letter">
                    <Icon name="check" />
                  </span>
                  <div>
                    <strong>{t.common.done}</strong>
                    <small>{formatCount(groups?.done.length ?? 0, "entry")}</small>
                  </div>
                </div>
                <div className="period-mini">
                  <span className="period-letter">
                    <Icon name="close" />
                  </span>
                  <div>
                    <strong>{t.common.notDone}</strong>
                    <small>{formatCount(groups?.notDone.length ?? 0, "entry")}</small>
                  </div>
                </div>
              </div>
              <ExperimentProgress experiment={current} />
              <div className="focus-footer">
                <span>
                  <Icon name="calendar" />
                  {formatDate(current.startDate)} — {formatDate(endDate(current))}
                </span>
                <DailyEntryButton experiment={current} variant="ghost" />
                <Link href={`/experiments/${current.id}`} className="text-link">
                  {t.dashboard.view}
                  <Icon name="arrow" />
                </Link>
              </div>
            </Card>
            <Card className="today-card">
              <span className="icon-tile">
                <Icon name={todayEntry ? "check" : "sun"} />
              </span>
              <span className="eyebrow">{t.dashboard.next}</span>
              <h2>{todayEntry ? t.dashboard.checked : t.dashboard.moment}</h2>
              <p>{todayEntry ? t.dashboard.thanks : t.dashboard.reflect}</p>
              <div className="today-period">
                <span>{t.dashboard.today}</span>
                <strong>{t.common.dayOf(progress.day, progress.total)}</strong>
              </div>
              <DailyEntryButton experiment={current} compact />
              <small className="today-footnote">{t.dashboard.localNote}</small>
            </Card>
          </div>
          <div className="dashboard-bottom">
            <Card className="trend-card">
              <div className="section-heading">
                <div>
                  <h2>{t.dashboard.trend}</h2>
                  <p className="muted">{t.dashboard.trendText}</p>
                </div>
                <span className="neutral-badge">1–10</span>
              </div>
              <MetricChart experiment={current} />
            </Card>
            <Card className="reflection-card">
              <span className="icon-tile">
                <Icon name="sparkles" />
              </span>
              <p className="eyebrow">{t.dashboard.better}</p>
              <h2>
                {t.dashboard.curiosity}
                <br />
                {t.dashboard.perfection}
              </h2>
              <p>{t.dashboard.advice}</p>
              <div className="reflection-divider" />
              <p className="reflection-bottom">
                {t.dashboard.observations}
                <br />
                {t.dashboard.limits}
              </p>
            </Card>
          </div>
        </>
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
    </>
  );
}
