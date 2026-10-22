"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { Card, Button, Textarea } from "@/components/ui";
import { t } from "@/i18n";
import { errorMessage } from "@/lib/errors";
import { useExperiments } from "@/features/experiments/context/experiments-provider";
import { metricColor, metricLabel } from "@/features/experiments/model/metrics";
import type { MetricValues } from "@/features/experiments/model/types";
import { MetricSlider } from "@/features/experiments/components/metric-slider";
import { sliderTicks } from "@/features/experiments/model/slider-geometry";
import { Icon } from "@/components/icon";
import { reflectionCompletion } from "../model/completion";
import type { DailyReflection, GlobalMetric } from "../model/types";

export function DailyReflectionSavedState({
  metrics,
  reflection,
  onEdit,
}: {
  metrics: readonly GlobalMetric[];
  reflection: DailyReflection;
  onEdit: () => void;
}) {
  const completion = reflectionCompletion(metrics, reflection);
  return (
    <>
      <div className="daily-reflection-saved-content">
        <p className="daily-reflection-progress" role="status">
          {completion.total
            ? t.reflection.recordedToday(completion.recordedCount, completion.total)
            : t.reflection.noActive}
          {completion.missing.length > 0 && (
            <span>{t.reflection.missingToday(completion.missing.length)}</span>
          )}
        </p>
        <div className="daily-reflection-summary">
          {completion.active.map(({ definition }) => {
            const value = reflection.values[definition.id];
            return value === undefined ||
              !completion.recorded.some((item) => item.definition.id === definition.id) ? (
              <div key={definition.id} className="daily-reflection-measure is-missing">
                <span className="daily-reflection-measure-name">{metricLabel(definition)}</span>
                <span className="daily-reflection-missing-label">{t.reflection.notRated}</span>
              </div>
            ) : (
              <div
                key={definition.id}
                className="daily-reflection-measure"
                role="img"
                aria-label={t.reflection.summaryScore(
                  metricLabel(definition),
                  value,
                  definition.scale.max,
                )}
                style={{ "--measure-color": metricColor(definition) } as CSSProperties}
              >
                <span className="daily-reflection-measure-name" aria-hidden="true">
                  {metricLabel(definition)}
                </span>
                <strong aria-hidden="true">{value}</strong>
                <span className="daily-reflection-measure-scale" aria-hidden="true">
                  {sliderTicks(definition.scale).map((tick) => (
                    <i key={tick} className={tick <= value ? "filled" : ""} />
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <Button
        className={
          completion.complete ? "daily-reflection-edit" : "daily-reflection-complete-action"
        }
        variant="secondary"
        aria-label={completion.complete ? t.reflection.edit : undefined}
        title={completion.complete ? t.reflection.edit : undefined}
        onClick={onEdit}
      >
        {completion.complete ? <Icon name="edit" /> : t.reflection.completeToday}
      </Button>
    </>
  );
}

export function DailyReflectionCard() {
  const { referenceDate, globalMetrics, reflections, saveReflection } = useExperiments();
  const saved = reflections.find((item) => item.observedDate === referenceDate);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<MetricValues>({});
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const visible = globalMetrics.filter(
    (item) => item.active || saved?.values[item.definition.id] !== undefined,
  );
  function openEdit() {
    setValues({ ...saved?.values });
    setNote(saved?.note ?? "");
    setError("");
    setEditing(true);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const scored = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    );
    if (!Object.keys(scored).length) {
      setError(t.reflection.chooseValue);
      return;
    }
    setPending(true);
    setError("");
    try {
      await saveReflection({ values: scored, note }, referenceDate);
      setEditing(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <Card
      className={`daily-reflection${saved && !editing ? " daily-reflection-saved" : ""}`}
      aria-labelledby="daily-reflection-heading"
    >
      <div className="daily-reflection-header">
        <div>
          <h2 id="daily-reflection-heading">{t.reflection.title}</h2>
          {!saved && <p className="muted">{t.reflection.help}</p>}
        </div>
        {saved && !editing && (
          <DailyReflectionSavedState metrics={globalMetrics} reflection={saved} onEdit={openEdit} />
        )}
      </div>
      {(!saved || editing) && (
        <form onSubmit={submit} noValidate>
          <div className="daily-reflection-sliders">
            {visible.map(({ definition }) => (
              <MetricSlider
                key={definition.id}
                metric={definition}
                value={values[definition.id]}
                onChange={(value) =>
                  setValues((current) => ({ ...current, [definition.id]: value }))
                }
              />
            ))}
          </div>
          <label htmlFor="daily-reflection-note" className="field-label">
            {t.reflection.note}
          </label>
          <Textarea
            id="daily-reflection-note"
            maxLength={500}
            rows={2}
            value={note}
            placeholder={t.reflection.notePlaceholder}
            onChange={(event) => setNote(event.target.value)}
          />
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="daily-reflection-actions">
            {editing && (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => setEditing(false)}
              >
                {t.common.cancel}
              </Button>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? t.reflection.saving : t.reflection.save}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
