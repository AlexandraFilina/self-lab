import { t } from "@/i18n";
import type { Experiment } from "@/features/experiments/model/types";
import { dayOffset } from "@/features/experiments/model/analytics";
import { METRICS } from "@/features/experiments/model/metrics";

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
  const y = (value: number) => top + ((10 - value) / 9) * plotHeight;
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
        {[1, 4, 7, 10].map((value) => (
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
        {experiment.metrics.map((metric) => {
          let previousDay = -2;
          const points = experiment.entries.flatMap((entry) => {
            const value = entry.values[metric];
            if (value === undefined) return [];
            const day = dayOffset(experiment.startDate, entry.observedDate);
            const point = { day, value, date: entry.observedDate };
            return [point];
          });
          const path = points
            .map((point) => {
              const command = point.day === previousDay + 1 ? "L" : "M";
              previousDay = point.day;
              return `${command}${x(point.day)},${y(point.value)}`;
            })
            .join(" ");
          return (
            <g key={metric}>
              <path
                d={path}
                fill="none"
                stroke={METRICS[metric].color}
                strokeWidth="2.4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {points.map((point) => (
                <circle
                  key={point.date}
                  cx={x(point.day)}
                  cy={y(point.value)}
                  r="3"
                  fill={METRICS[metric].color}
                  stroke="white"
                  strokeWidth="1"
                >
                  <title>
                    {t.experiments.pointTitle(METRICS[metric].label, point.value, point.day + 1)}
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
      <div className="chart-footer">
        <div className="chart-legend">
          {experiment.metrics.map((metric) => (
            <span key={metric}>
              <i style={{ backgroundColor: METRICS[metric].color }} />
              {METRICS[metric].label}
            </span>
          ))}
        </div>
        <span>{t.experiments.chartDays}</span>
      </div>
    </div>
  );
}
