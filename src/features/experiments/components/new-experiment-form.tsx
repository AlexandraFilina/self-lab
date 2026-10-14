"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { t } from "@/i18n";
import { errorMessage } from "@/lib/errors";
import { EXPERIMENT_LIMITS, newExperimentSchema } from "../model/schemas";
import { METRICS } from "../model/metrics";
import { METRIC_IDS } from "../model/types";
import { useExperiments } from "../context/experiments-provider";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { Button, Card, Input, Textarea } from "@/components/ui";

export function NewExperimentForm() {
  const router = useRouter();
  const { createExperiment } = useExperiments();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const attachForm = useCallback((form: HTMLFormElement | null) => {
    formRef.current = form;
    return () => {
      form?.reset();
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = newExperimentSchema.safeParse({
      title: data.get("title"),
      question: data.get("question"),
      habit: data.get("habit"),
      durationDays: Number(data.get("durationDays")),
      metrics: data.getAll("metrics"),
    });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setError("");
    setSaving(true);
    try {
      const id = await createExperiment(result.data);
      form.reset();
      router.push(`/experiments/${id}`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Link href="/experiments" className="back-link">
        {t.common.back}
      </Link>
      <PageHeading eyebrow={t.form.eyebrow} title={t.form.title} description={t.form.description} />
      <div className="form-layout">
        <form
          ref={attachForm}
          noValidate
          onSubmit={submit}
          onReset={() => setError("")}
          className="experiment-form"
        >
          <Card className="form-card">
            <div className="form-section-title">
              <span className="step-number">01</span>
              <div>
                <h2>{t.form.questionTitle}</h2>
                <p className="muted">{t.form.questionHelp}</p>
              </div>
            </div>
            <div className="form-field">
              <label htmlFor="experiment-title" className="field-label">
                {t.form.name}
              </label>
              <Input
                id="experiment-title"
                name="title"
                placeholder={t.form.namePlaceholder}
                required
                maxLength={EXPERIMENT_LIMITS.title}
              />
            </div>
            <div className="form-field">
              <label htmlFor="experiment-question" className="field-label">
                {t.form.question}
              </label>
              <Textarea
                id="experiment-question"
                name="question"
                placeholder={t.form.questionPlaceholder}
                required
                maxLength={EXPERIMENT_LIMITS.question}
                rows={3}
              />
            </div>
          </Card>
          <Card className="form-card">
            <div className="form-section-title">
              <span className="step-number">02</span>
              <div>
                <h2>{t.form.habitTitle}</h2>
                <p className="muted">{t.form.habitHelp}</p>
              </div>
            </div>
            <div className="form-field">
              <label htmlFor="experiment-habit" className="field-label">
                {t.form.habit}
              </label>
              <Textarea
                id="experiment-habit"
                name="habit"
                placeholder={t.form.habitPlaceholder}
                required
                maxLength={EXPERIMENT_LIMITS.habit}
                rows={3}
              />
            </div>
            <div className="form-field">
              <label htmlFor="duration-days" className="field-label">
                {t.form.duration}
              </label>
              <div className="duration-input">
                <Input
                  id="duration-days"
                  name="durationDays"
                  type="number"
                  min={EXPERIMENT_LIMITS.minDays}
                  max={EXPERIMENT_LIMITS.maxDays}
                  step={1}
                  required
                  defaultValue={14}
                />
                <span>{t.form.days}</span>
              </div>
              <p className="field-hint">{t.form.durationHelp}</p>
            </div>
          </Card>
          <Card className="form-card">
            <div className="form-section-title">
              <span className="step-number">03</span>
              <div>
                <h2>{t.form.metricsTitle}</h2>
                <p className="muted">{t.form.metricsHelp}</p>
              </div>
            </div>
            <fieldset className="metric-options">
              <legend className="sr-only">{t.form.legend}</legend>
              {METRIC_IDS.map((metric) => (
                <label key={metric} className="metric-option">
                  <input
                    type="checkbox"
                    name="metrics"
                    value={metric}
                    defaultChecked={metric === "mood"}
                  />
                  <span>
                    <strong>{METRICS[metric].label}</strong>
                    <small>{METRICS[metric].description}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          </Card>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-submit">
            <Link
              href="/experiments"
              className="button button-secondary"
              onClick={(event) => {
                if (saving) {
                  event.preventDefault();
                  return;
                }
                formRef.current?.reset();
              }}
            >
              {t.common.cancel}
            </Link>
            <Button type="submit" disabled={saving}>
              <Icon name="plus" />
              {saving ? t.form.saving : t.common.createExperiment}
            </Button>
          </div>
          <p className="form-demo-note">
            <Icon name="info" />
            {t.form.local}
          </p>
        </form>
        <aside className="form-advice">
          <Card>
            <span className="icon-tile">
              <Icon name="sparkles" />
            </span>
            <h2>{t.form.adviceTitle}</h2>
            <p>{t.form.advice}</p>
            {[t.form.tipOne, t.form.tipTwo, t.form.tipThree].map((tip, index) => (
              <div key={tip} className="advice-item">
                <span>{index + 1}</span>
                <p>{tip}</p>
              </div>
            ))}
            <div className="insight-note">
              <Icon name="info" />
              <p>{t.form.limitations}</p>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
