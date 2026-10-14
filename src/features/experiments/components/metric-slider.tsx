"use client";
import { t } from "@/i18n";
import { METRICS } from "../model/metrics";
import type { MetricId } from "../model/types";
import { Button } from "@/components/ui";

export function MetricSlider({
  metric,
  value,
  onChange,
}: {
  metric: MetricId;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  const id = `score-${metric}`;
  const level =
    value === undefined ? null : Math.max(0, Math.min(6, Math.round(((value - 1) / 9) * 6)));
  const description = level === null ? t.checkIn.notRated : t.checkIn.levels[level];
  return (
    <div className={`metric-slider ${value === undefined ? "metric-unrated" : ""}`}>
      <div className="section-heading">
        <label htmlFor={id}>{METRICS[metric].label}</label>
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
                level !== null && level >= 4
                  ? "M7 13q5 6 10 0"
                  : level !== null && level <= 1
                    ? "M7 16q5-6 10 0"
                    : "M7 15h10"
              }
            />
          </svg>
          <span>
            {description}
            {value !== undefined && <> · {value}/10</>}
          </span>
        </output>
      </div>
      <p id={`${id}-description`} className="muted">
        {METRICS[metric].description}
      </p>
      <input
        id={id}
        type="range"
        min={1}
        max={10}
        step={1}
        value={value ?? 5}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerDown={() => {
          if (value === undefined) onChange(5);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onChange(value ?? 5);
          }
        }}
        aria-describedby={`${id}-description`}
        aria-valuetext={
          value === undefined
            ? t.checkIn.chooseScore(METRICS[metric].label)
            : t.checkIn.scoreText(value, description)
        }
      />
      <div className="metric-level-ticks" aria-hidden="true">
        {t.checkIn.levels.map((label, index) => (
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
        <span>{t.checkIn.scaleHigh}</span>
      </div>
    </div>
  );
}
