"use client";

import { useState } from "react";
import { Card, Button } from "@/components/ui";
import { t } from "@/i18n";
import { dayOffset } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { useExperiments } from "@/features/experiments/context/experiments-provider";
import { metricColor, metricLabel } from "@/features/experiments/model/metrics";
import {
  availableTrendMetrics,
  trendActivity,
  trendSeries,
  trendWindow,
  type TrendRange,
} from "../model/dashboard-trends";

const ranges: readonly TrendRange[] = [7, 14, 30, "all"];

export function DashboardTrends() {
  const { experiments, globalMetrics, reflections, referenceDate } = useExperiments();
  const [metricId, setMetricId] = useState<string>("mood");
  const [range, setRange] = useState<TrendRange>(7);
  const [page, setPage] = useState(0);
  const [showActivity, setShowActivity] = useState(false);
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [focused, setFocused] = useState<{ date: string; kind: "score" | "activity" } | null>(null);
  const metrics = availableTrendMetrics(globalMetrics);
  const metric = metrics.find((item) => item.id === metricId) ?? metrics[0];
  const userExperiments = experiments.filter((item) => item.source === "user");
  const selectedExperimentId =
    experimentId && userExperiments.some((item) => item.id === experimentId)
      ? experimentId
      : (userExperiments[0]?.id ?? null);
  const window = trendWindow(reflections, referenceDate, range, page);
  const series = metric ? trendSeries(reflections, metric, window) : { points: [], segments: [] };
  const activity = showActivity ? trendActivity(experiments, selectedExperimentId, window) : [];
  const focusedPoint =
    focused?.kind === "score" ? series.points.find((point) => point.date === focused.date) : null;
  const focusedActivity = activity.find((item) => item.date === focused?.date);
  const width = 960;
  const height = 260;
  const left = 50;
  const right = 22;
  const top = 22;
  const bottom = 48;
  const totalDays = dayOffset(window.start, window.end) + 1;
  const x = (date: string) =>
    left + ((dayOffset(window.start, date) + 0.5) / totalDays) * (width - left - right);
  const scale = metric?.scale;
  const y = (value: number) =>
    scale ? top + ((scale.max - value) / (scale.max - scale.min)) * (height - top - bottom) : top;
  const axisDates = [...new Set([window.start, window.end])];
  const color = metric ? metricColor(metric) : "#48a899";
  const hasGaps = series.segments.some((segment) => segment.kind === "dashed");

  return (
    <Card className="dashboard-trends" aria-labelledby="dashboard-trends-heading">
      <div className="section-heading">
        <h2 id="dashboard-trends-heading">{t.dashboardTrends.title}</h2>
        <span className="neutral-badge">{t.dashboardTrends.scale}</span>
      </div>
      <div className="dashboard-trends-controls">
        <label className="field-label" htmlFor="dashboard-trend-metric">
          {t.dashboardTrends.metric}
        </label>
        <select
          id="dashboard-trend-metric"
          className="dashboard-trends-select"
          value={metric?.id ?? ""}
          onChange={(event) => {
            setMetricId(event.target.value);
            setFocused(null);
          }}
        >
          {metrics.map((item) => (
            <option key={item.id} value={item.id}>
              {metricLabel(item)}
            </option>
          ))}
        </select>
        <div className="dashboard-trends-ranges" role="group" aria-label={t.dashboardTrends.range}>
          {ranges.map((value) => (
            <Button
              key={value}
              type="button"
              variant={range === value ? "primary" : "secondary"}
              aria-pressed={range === value}
              onClick={() => {
                setRange(value);
                setPage(0);
                setFocused(null);
              }}
            >
              {value === "all" ? t.dashboardTrends.all : t.dashboardTrends.days(value)}
            </Button>
          ))}
        </div>
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
            onClick={() => {
              setPage((current) => current + 1);
              setFocused(null);
            }}
          >
            {t.dashboardTrends.previous}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!window.canNext}
            onClick={() => {
              setPage((current) => Math.max(0, current - 1));
              setFocused(null);
            }}
          >
            {t.dashboardTrends.next}
          </Button>
        </div>
      </div>
      <div className="dashboard-trends-activity-controls">
        <label>
          <input
            type="checkbox"
            checked={showActivity}
            onChange={(event) => {
              setShowActivity(event.target.checked);
              setFocused(null);
            }}
            disabled={userExperiments.length === 0}
          />
          {t.dashboardTrends.showActivity}
        </label>
        {showActivity && selectedExperimentId && (
          <select
            className="dashboard-trends-select"
            aria-label={t.dashboardTrends.experiment}
            value={selectedExperimentId}
            onChange={(event) => {
              setExperimentId(event.target.value);
              setFocused(null);
            }}
          >
            {userExperiments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        )}
      </div>
      {series.points.length === 0 &&
        (activity.length > 0 ? (
          <p className="field-hint">{t.dashboardTrends.empty}</p>
        ) : (
          <div className="chart-empty">{t.dashboardTrends.empty}</div>
        ))}
      {(series.points.length > 0 || activity.length > 0) && (
        <div className="dashboard-trends-chart">
          <svg
            className="metric-chart"
            viewBox={`0 0 ${width} ${height}`}
            role="group"
            aria-label={t.dashboardTrends.chartLabel(metric ? metricLabel(metric) : "")}
          >
            {scale &&
              Array.from(
                { length: 4 },
                (_, index) => scale.min + (index * (scale.max - scale.min)) / 3,
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
                  <text
                    x={left - 13}
                    y={y(value) + 4}
                    textAnchor="end"
                    fill="#92919e"
                    fontSize="11"
                  >
                    {value}
                  </text>
                </g>
              ))}
            {(["solid", "dashed"] as const).map((kind) => {
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
                  strokeWidth="2.8"
                  strokeDasharray={kind === "dashed" ? "4 5" : undefined}
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
                  formatDate(point.date),
                  metric ? metricLabel(metric) : "",
                  point.value,
                  scale?.max ?? 10,
                )}
                onMouseEnter={() => setFocused({ date: point.date, kind: "score" })}
                onMouseLeave={() => setFocused(null)}
                onFocus={() => setFocused({ date: point.date, kind: "score" })}
                onBlur={() => setFocused(null)}
              />
            ))}
            {activity.map((item) => (
              <circle
                key={item.date}
                className="dashboard-trend-activity-point"
                data-date={item.date}
                data-status={item.status}
                cx={x(item.date)}
                cy={height - 34}
                r="5"
                fill={item.status === "done" ? "#7765df" : "white"}
                stroke="#7765df"
                strokeWidth="2"
                tabIndex={0}
                role="img"
                aria-label={t.dashboardTrends.activityLabel(
                  formatDate(item.date),
                  item.title,
                  item.status === "done" ? t.common.done : t.common.notDone,
                )}
                onMouseEnter={() => setFocused({ date: item.date, kind: "activity" })}
                onMouseLeave={() => setFocused(null)}
                onFocus={() => setFocused({ date: item.date, kind: "activity" })}
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
          {focused && (focusedPoint || focusedActivity) && (
            <p className="dashboard-trends-tooltip" role="status">
              <strong>
                {formatDate(focused.date, { day: "numeric", month: "long", year: "numeric" })}
              </strong>
              {focusedPoint && metric && (
                <span>
                  {t.dashboardTrends.score(
                    metricLabel(metric),
                    focusedPoint.value,
                    metric.scale.max,
                  )}
                </span>
              )}
              {focusedActivity && (
                <span>
                  {focusedActivity.title} ·{" "}
                  {focusedActivity.status === "done" ? t.common.done : t.common.notDone}
                </span>
              )}
            </p>
          )}
        </div>
      )}
      {series.points.length === 1 && <p className="field-hint">{t.dashboardTrends.single}</p>}
      {hasGaps && <p className="field-hint">{t.dashboardTrends.gaps}</p>}
      {showActivity && activity.length > 0 && (
        <p className="dashboard-trends-legend">{t.dashboardTrends.activityLegend}</p>
      )}
    </Card>
  );
}
