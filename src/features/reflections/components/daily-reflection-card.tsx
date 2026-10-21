"use client";

import { useState, type FormEvent } from "react";
import { Card, Button, Textarea } from "@/components/ui";
import { t } from "@/i18n";
import { errorMessage } from "@/lib/errors";
import { useExperiments } from "@/features/experiments/context/experiments-provider";
import { metricLabel } from "@/features/experiments/model/metrics";
import type { MetricValues } from "@/features/experiments/model/types";
import { MetricSlider } from "@/features/experiments/components/metric-slider";

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
          <div className="daily-reflection-summary">
            <span className="sr-only">{t.reflection.summary}</span>
            {visible
              .filter((item) => saved.values[item.definition.id] !== undefined)
              .map((item) => (
                <span key={item.definition.id}>
                  {metricLabel(item.definition)} · {saved.values[item.definition.id]}/
                  {item.definition.scale.max}
                </span>
              ))}
          </div>
        )}
        {saved && !editing && (
          <Button variant="secondary" onClick={openEdit}>
            {t.reflection.edit}
          </Button>
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
