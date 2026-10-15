"use client";
import { t } from "@/i18n";
import { metricLabel, metricDescription } from "../model/metrics";
import type { MetricDefinition } from "../model/types";
import { Button } from "@/components/ui";

export function MetricSlider({
  metric,
  value,
  onChange,
}: {
  metric: MetricDefinition;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  const id = `score-${metric.id}`;
  const { min, max, step } = metric.scale;
  const midpoint = min + Math.floor((max - min) / step / 2) * step;
  const levels = metric.kind === "custom" ? t.checkIn.customLevels : t.checkIn.levels;
  const level =
    value === undefined
      ? null
      : Math.max(0, Math.min(6, Math.round(((value - min) / (max - min)) * 6)));
  const description = level === null ? t.checkIn.notRated : levels[level];
  return (
    <div className={`metric-slider ${value === undefined ? "metric-unrated" : ""}`}>
      <div className="section-heading">
        <label htmlFor={id}>{metricLabel(metric)}</label>
        <output htmlFor={id} className="score-output">
          <svg
            viewBox="0 0 24 24"
            width="21"
            height="21"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path
              d={
                metric.kind === "custom"
                  ? "M7 15h10"
                  : level !== null && level >= 4
                    ? "M7 13q5 6 10 0"
                    : level !== null && level <= 1
                      ? "M7 16q5-6 10 0"
                      : "M7 15h10"
              }
            />
          </svg>
          <span>
            {description}
            {value !== undefined && (
              <>
                {" "}
                · {value}/{max}
              </>
            )}
          </span>
        </output>
      </div>
      <p id={`${id}-description`} className="muted">
        {metricDescription(metric)}
      </p>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? midpoint}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerDown={() => {
          if (value === undefined) onChange(midpoint);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onChange(value ?? midpoint);
          }
        }}
        aria-describedby={`${id}-description`}
        aria-valuetext={
          value === undefined
            ? t.checkIn.chooseScore(metricLabel(metric))
            : t.checkIn.scoreText(value, description, max)
        }
      />
      <div className="metric-level-ticks" aria-hidden="true">
        {levels.map((label, index) => (
          <i key={label} className={index === level ? "level-active" : ""} />
        ))}
      </div>
      <div className="range-labels">
        <span>{t.checkIn.scaleLow}</span>
        <Button
          type="button"
          variant="ghost"
          disabled={value === undefined}
          onClick={() => onChange(undefined)}
        >
          {t.checkIn.clear}
        </Button>
        <span>{metric.kind === "custom" ? t.checkIn.scaleHighAmount : t.checkIn.scaleHigh}</span>
      </div>
    </div>
  );
}
