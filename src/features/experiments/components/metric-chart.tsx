import { t } from "@/i18n";
import type { Experiment } from "@/features/experiments/model/types";
import { buildChartSegments } from "../model/chart-segments";
import { dayOffset } from "@/features/experiments/model/analytics";
import { metricColor, metricLabel, isMetricValue } from "@/features/experiments/model/metrics";

export function MetricChart({ experiment }: { experiment: Experiment }) {
  const total = experiment.durationDays;
  const width = 960,
    height = 260,
    left = 58,
    right = 24,
    top = 42,
    bottom = 48;
  const plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const x = (day: number) => left + ((day + 0.5) / total) * plotWidth;
  const scale = experiment.metrics[0].scale;
  const y = (value: number) => top + ((scale.max - value) / (scale.max - scale.min)) * plotHeight;
  const colors = new Set<string>();
  const alternateColors = ["#7765df", "#d39753", "#728fb8", "#c78877", "#a19653"];
  const series = experiment.metrics.map((metric) => {
    const baseColor = metricColor(metric);
    const color = colors.has(baseColor)
      ? (alternateColors.find((candidate) => !colors.has(candidate)) ?? baseColor)
      : baseColor;
    colors.add(color);
    return {
      metric,
      color,
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
    };
  });
  const segmentedSeries = series.map((item) => ({
    ...item,
    segments: buildChartSegments(item.points),
  }));
  const hasGaps = segmentedSeries.some(({ segments }) =>
    segments.some((segment) => segment.kind === "faded"),
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
      <div className="chart-legend" role="list" aria-label={t.experiments.chartLegend}>
        {series.map(({ metric, color }) => (
          <span key={metric.id} role="listitem">
            <i style={{ backgroundColor: color }} />
            {metricLabel(metric)}
          </span>
        ))}
      </div>
      <svg
        className="metric-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t.experiments.chartLabel}
      >
        <text x={left} y={20} fill="#797184" fontSize="12">
          {t.experiments.chartScore(scale.min, scale.max)}
        </text>
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
        {segmentedSeries.map(({ metric, color, points, segments }) => {
          const paths = { solid: "", faded: "" };
          for (const segment of segments) {
            paths[segment.kind] +=
              `M${x(dayOffset(experiment.startDate, segment.from.date))},${y(segment.from.value)} L${x(dayOffset(experiment.startDate, segment.to.date))},${y(segment.to.value)} `;
          }
          return (
            <g key={metric.id} data-metric-id={metric.id}>
              {(["solid", "faded"] as const).map(
                (kind) =>
                  paths[kind] && (
                    <path
                      key={kind}
                      data-segment={kind}
                      d={paths[kind].trim()}
                      fill="none"
                      stroke={color}
                      strokeWidth={kind === "faded" ? "1.8" : "2.8"}
                      strokeOpacity={kind === "faded" ? 0.28 : 1}
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
                  r="4.2"
                  fill={color}
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
            y={height - 15}
            textAnchor="middle"
            fontSize="12"
            fill="#797184"
          >
            {t.experiments.chartDay(day)}
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
    </div>
  );
}
