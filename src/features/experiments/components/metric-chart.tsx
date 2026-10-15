import { t } from "@/i18n";
import type { Experiment } from "@/features/experiments/model/types";
import { buildChartSegments } from "../model/chart-segments";
import { dayOffset } from "@/features/experiments/model/analytics";
import { metricColor, metricLabel, isMetricValue } from "@/features/experiments/model/metrics";

export function MetricChart({ experiment }: { experiment: Experiment }) {
  const total = experiment.durationDays;
  const width = 640,
    height = 236,
    left = 30,
    right = 16,
    top = 30,
    bottom = 30;
  const plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const x = (day: number) => left + ((day + 0.5) / total) * plotWidth;
  const scale = experiment.metrics[0].scale;
  const y = (value: number) => top + ((scale.max - value) / (scale.max - scale.min)) * plotHeight;
  const series = experiment.metrics.map((metric) => ({
    metric,
    points: experiment.entries
      .flatMap((entry) => {
        const value = entry.values[metric.id];
        return isMetricValue(value, metric.scale)
          ? [
              {
                day: dayOffset(experiment.startDate, entry.observedDate),
                value,
                date: entry.observedDate,
              },
            ]
          : [];
      })
      .sort((a, b) => a.day - b.day),
  }));
  const segmentedSeries = series.map((item) => ({
    ...item,
    segments: buildChartSegments(item.points),
  }));
  const hasGaps = segmentedSeries.some(({ segments }) =>
    segments.some((segment) => segment.kind === "dashed"),
  );
  const ticks = [
    ...new Set([1, Math.ceil(total / 4), Math.ceil(total / 2), Math.ceil((total * 3) / 4), total]),
  ];

  if (experiment.entries.length === 0)
    return (
      <div className="chart-empty">
        <span>{t.experiments.chartEmpty}</span>
        <p>{t.experiments.chartEmptyText}</p>
      </div>
    );

  return (
    <div className="chart-container">
      <svg
        className="metric-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t.experiments.chartLabel}
      >
        {Array.from(
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
            <text x={left - 13} y={y(value) + 4} textAnchor="end" fill="#92919e" fontSize="11">
              {value}
            </text>
          </g>
        ))}
        {segmentedSeries.map(({ metric, points, segments }) => {
          const paths = { solid: "", dashed: "" };
          for (const segment of segments) {
            paths[segment.kind] +=
              `M${x(dayOffset(experiment.startDate, segment.from.date))},${y(segment.from.value)} L${x(dayOffset(experiment.startDate, segment.to.date))},${y(segment.to.value)} `;
          }
          return (
            <g key={metric.id} data-metric-id={metric.id}>
              {(["solid", "dashed"] as const).map(
                (kind) =>
                  paths[kind] && (
                    <path
                      key={kind}
                      data-segment={kind}
                      d={paths[kind].trim()}
                      fill="none"
                      stroke={metricColor(metric)}
                      strokeWidth="2.4"
                      strokeDasharray={kind === "dashed" ? "4 5" : undefined}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ),
              )}
              {points.map((point) => (
                <circle
                  key={point.date}
                  cx={x(point.day)}
                  cy={y(point.value)}
                  r="3"
                  fill={metricColor(metric)}
                  stroke="white"
                  strokeWidth="1"
                >
                  <title>
                    {t.experiments.pointTitle(
                      metricLabel(metric),
                      point.value,
                      point.day + 1,
                      metric.scale.max,
                    )}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
        {ticks.map((day) => (
          <text
            key={day}
            x={x(day - 1)}
            y={height - 8}
            textAnchor="middle"
            fontSize="10"
            fill="#92919e"
          >
            {day}
          </text>
        ))}
      </svg>
      {series
        .filter((series) => series.points.length === 1)
        .map(({ metric }) => (
          <p className="field-hint" key={metric.id}>
            {metricLabel(metric)}: {t.experiments.singleObservation}
          </p>
        ))}
      {hasGaps && <p className="field-hint">{t.experiments.chartGaps}</p>}
      <div className="chart-footer">
        <div className="chart-legend">
          {experiment.metrics.map((metric) => (
            <span key={metric.id}>
              <i style={{ backgroundColor: metricColor(metric) }} />
              {metricLabel(metric)}
            </span>
          ))}
        </div>
        <span>{t.experiments.chartDays}</span>
      </div>
    </div>
  );
}
