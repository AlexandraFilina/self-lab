"use client";

import { useState } from "react";
import { Card, Button } from "@/components/ui";
import { t } from "@/i18n";
import { dayOffset } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { useExperiments } from "@/features/experiments/context/experiments-provider";
import { metricColor, metricLabel } from "@/features/experiments/model/metrics";
import type { MetricDefinition } from "@/features/experiments/model/types";
import {
  availableTrendMetrics,
  trendActivity,
  trendSeries,
  trendWindow,
  type TrendRange,
} from "../model/dashboard-trends";

const ranges: readonly TrendRange[] = [7, 14, 30, "all"];
type Window = ReturnType<typeof trendWindow>;
type Series = ReturnType<typeof trendSeries>;
type Activity = ReturnType<typeof trendActivity>;

export function DashboardTrends() {
  const { experiments, globalMetrics, reflections, referenceDate } = useExperiments();
  const [metricId, setMetricId] = useState<string>("mood");
  const [range, setRange] = useState<TrendRange>(7);
  const [page, setPage] = useState(0);
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const metrics = availableTrendMetrics(globalMetrics);
  const metric = metrics.find((item) => item.id === metricId) ?? metrics[0];
  const userExperiments = experiments.filter(
    (item) =>
      item.source === "user" &&
      (item.status === "active" || item.entries.some((entry) => entry.habitStatus !== null)),
  );
  const selectedExperiment = userExperiments.find((item) => item.id === experimentId);
  const window = trendWindow(reflections, referenceDate, range, page);
  const series = metric ? trendSeries(reflections, metric, window) : null;
  const activity = selectedExperiment
    ? trendActivity(experiments, selectedExperiment.id, window)
    : [];

  return (
    <Card className="dashboard-trends" aria-labelledby="dashboard-trends-heading">
      <div className="section-heading">
        <h2 id="dashboard-trends-heading">{t.dashboardTrends.title}</h2>
        <span className="neutral-badge">{t.dashboardTrends.scale}</span>
      </div>
      <div className="dashboard-trends-toolbar">
        <div className="dashboard-trends-metric-control">
          <label className="field-label" htmlFor="dashboard-trend-metric">
            {t.dashboardTrends.metric}
          </label>
          <select
            id="dashboard-trend-metric"
            className="dashboard-trends-select"
            value={metric?.id ?? ""}
            onChange={(event) => setMetricId(event.target.value)}
          >
            {metrics.map((item) => (
              <option key={item.id} value={item.id}>
                {metricLabel(item)}
              </option>
            ))}
          </select>
        </div>
        <div className="dashboard-trends-time-controls">
          <div
            className="dashboard-trends-ranges"
            role="group"
            aria-label={t.dashboardTrends.range}
          >
            {ranges.map((value) => (
              <Button
                key={value}
                type="button"
                variant={range === value ? "primary" : "secondary"}
                aria-pressed={range === value}
                onClick={() => {
                  setRange(value);
                  setPage(0);
                }}
              >
                {value === "all" ? t.dashboardTrends.all : t.dashboardTrends.days(value)}
              </Button>
            ))}
          </div>
          <div className="dashboard-trends-navigation">
            <span>
              {formatDate(window.start)} — {formatDate(window.end)}
            </span>
            <div>
              <Button
                type="button"
                variant="secondary"
                disabled={!window.canPrevious}
                onClick={() => setPage((current) => current + 1)}
              >
                {t.dashboardTrends.previous}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!window.canNext}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                {t.dashboardTrends.next}
              </Button>
            </div>
          </div>
        </div>
        <div className="dashboard-trends-habit-control">
          <label className="field-label" htmlFor="dashboard-trend-habit">
            {t.dashboardTrends.habitContext}
          </label>
          <select
            id="dashboard-trend-habit"
            className="dashboard-trends-select"
            value={selectedExperiment?.id ?? ""}
            onChange={(event) => setExperimentId(event.target.value || null)}
          >
            <option value="">{t.dashboardTrends.none}</option>
            {userExperiments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      {metric && series ? (
        <DashboardTrendVisual
          key={`${metric.id}:${window.start}:${window.end}:${selectedExperiment?.id ?? "none"}`}
          metric={metric}
          series={series}
          window={window}
          activity={activity}
          experimentTitle={selectedExperiment?.title ?? null}
        />
      ) : (
        <div className="chart-empty">{t.dashboardTrends.empty}</div>
      )}
    </Card>
  );
}

export function DashboardTrendVisual({
  metric,
  series,
  window,
  activity,
  experimentTitle,
}: {
  metric: MetricDefinition;
  series: Series;
  window: Window;
  activity: Activity;
  experimentTitle: string | null;
}) {
  const [focused, setFocused] = useState<{ date: string; kind: "score" | "activity" } | null>(null);
  if (series.points.length === 0)
    return <div className="chart-empty">{t.dashboardTrends.emptyMetric(metricLabel(metric))}</div>;

  const width = 960;
  const height = 260;
  const left = 50;
  const right = 22;
  const top = 22;
  const bottom = 48;
  const totalDays = dayOffset(window.start, window.end) + 1;
  const x = (date: string) =>
    left + ((dayOffset(window.start, date) + 0.5) / totalDays) * (width - left - right);
  const y = (value: number) =>
    top +
    ((metric.scale.max - value) / (metric.scale.max - metric.scale.min)) * (height - top - bottom);
  const axisDates = [...new Set([window.start, window.end])];
  const color = metricColor(metric);
  const focusedPoint =
    focused?.kind === "score" ? series.points.find((point) => point.date === focused.date) : null;
  const focusedActivity = activity.find((item) => item.date === focused?.date);
  const hasGaps = series.segments.some((segment) => segment.kind === "faded");

  return (
    <div className="dashboard-trends-chart">
      <svg
        className="metric-chart dashboard-trends-numeric"
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label={t.dashboardTrends.chartLabel(metricLabel(metric))}
      >
        {Array.from(
          { length: 4 },
          (_, index) => metric.scale.min + (index * (metric.scale.max - metric.scale.min)) / 3,
        ).map((value) => (
          <g key={value}>
            <line
              x1={left}
              x2={width - right}
              y1={y(value)}
              y2={y(value)}
              stroke="#ececf2"
              strokeDasharray="3 5"
            />
            <text x={left - 13} y={y(value) + 4} textAnchor="end" fill="#92919e" fontSize="11">
              {value}
            </text>
          </g>
        ))}
        {(["solid", "faded"] as const).map((kind) => {
          const path = series.segments
            .filter((segment) => segment.kind === kind)
            .map(
              (segment) =>
                `M${x(segment.from.date)},${y(segment.from.value)} L${x(segment.to.date)},${y(segment.to.value)}`,
            )
            .join(" ");
          return path ? (
            <path
              key={kind}
              data-segment={kind}
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={kind === "faded" ? "1.8" : "2.8"}
              strokeOpacity={kind === "faded" ? 0.28 : 1}
              strokeLinecap="round"
            />
          ) : null;
        })}
        {series.points.map((point) => (
          <circle
            key={point.date}
            className="dashboard-trend-point"
            data-date={point.date}
            cx={x(point.date)}
            cy={y(point.value)}
            r="5"
            fill={color}
            stroke="white"
            strokeWidth="1.5"
            tabIndex={0}
            role="img"
            aria-label={t.dashboardTrends.pointLabel(
              formatDate(point.date, { day: "numeric", month: "long", year: "numeric" }),
              metricLabel(metric),
              point.value,
              metric.scale.max,
            )}
            onMouseEnter={() => setFocused({ date: point.date, kind: "score" })}
            onMouseLeave={() => setFocused(null)}
            onFocus={() => setFocused({ date: point.date, kind: "score" })}
            onBlur={() => setFocused(null)}
          />
        ))}
        {axisDates.map((date) => (
          <text
            key={date}
            x={x(date)}
            y={height - 8}
            textAnchor={date === window.start ? "start" : "end"}
            fill="#797184"
            fontSize="11"
          >
            {formatDate(date)}
          </text>
        ))}
      </svg>
      {experimentTitle && (
        <div className="dashboard-trends-habit-strip">
          <div className="dashboard-trends-habit-heading">
            <span>{t.dashboardTrends.habitTitle(experimentTitle)}</span>
            <div
              className="dashboard-trends-habit-legend"
              role="list"
              aria-label={t.dashboardTrends.habitLegend}
            >
              <span role="listitem">
                <i className="done" aria-hidden="true" />
                {t.common.done}
              </span>
              <span role="listitem">
                <i className="not-done" aria-hidden="true" />
                {t.common.notDone}
              </span>
            </div>
          </div>
          <svg
            className="dashboard-trends-activity-strip"
            viewBox={`0 0 ${width} 44`}
            role="group"
            aria-label={t.dashboardTrends.habitTitle(experimentTitle)}
          >
            <line x1={left} x2={width - right} y1="22" y2="22" stroke="#e9e5f0" />
            {activity.map((item) => (
              <circle
                key={item.date}
                className="dashboard-trend-activity-point"
                data-date={item.date}
                data-status={item.status}
                cx={x(item.date)}
                cy="22"
                r="6"
                fill={item.status === "done" ? "#7765df" : "white"}
                stroke="#7765df"
                strokeWidth="2"
                tabIndex={0}
                role="img"
                aria-label={t.dashboardTrends.activityLabel(
                  item.title,
                  item.status === "done" ? t.common.done : t.common.notDone,
                  formatDate(item.date, { day: "numeric", month: "long" }),
                )}
                onMouseEnter={() => setFocused({ date: item.date, kind: "activity" })}
                onMouseLeave={() => setFocused(null)}
                onFocus={() => setFocused({ date: item.date, kind: "activity" })}
                onBlur={() => setFocused(null)}
              />
            ))}
          </svg>
        </div>
      )}
      {focused && (focusedPoint || focusedActivity) && (
        <div className="dashboard-trends-tooltip" role="status">
          <strong>
            {formatDate(focused.date, { day: "numeric", month: "long", year: "numeric" })}
          </strong>
          {focusedPoint && (
            <>
              <span>{metricLabel(metric)}</span>
              <span>{t.dashboardTrends.value(focusedPoint.value, metric.scale.max)}</span>
            </>
          )}
          {focusedActivity && (
            <span>
              {t.dashboardTrends.habitStatus(
                focusedActivity.status === "done" ? t.common.done : t.common.notDone,
              )}
            </span>
          )}
        </div>
      )}
      {series.points.length === 1 && <p className="field-hint">{t.dashboardTrends.single}</p>}
      {hasGaps && <p className="field-hint">{t.dashboardTrends.gaps}</p>}
    </div>
  );
}
