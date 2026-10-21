"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { t } from "@/i18n";
import { errorMessage } from "@/lib/errors";
import { EXPERIMENT_IDEAS, type ExperimentIdea } from "../data/experiment-ideas";
import { createEmptyExperimentDraft, createIdeaDraft } from "../model/onboarding";
import { EXPERIMENT_LIMITS, newExperimentSchema, experimentQuestionSchema } from "../model/schemas";
import { metricDescription, metricLabel } from "../model/metrics";
import { useExperiments } from "../context/experiments-provider";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { Button, Card, Input, Textarea } from "@/components/ui";

export function NewExperimentForm({ onboarding = false }: { onboarding?: boolean }) {
  const router = useRouter();
  const fieldId = (name: string) => (onboarding ? `onboarding-${name}` : name);
  const { createExperiment, experiments, globalMetrics } = useExperiments();
  const [step, setStep] = useState<"question" | "details">("question");
  const [fields, setFields] = useState(createEmptyExperimentDraft);
  const [selectedIdea, setSelectedIdea] = useState<string | null>(null);
  const sample = experiments.find((experiment) => experiment.source === "sample");
  const creationId = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const reset = useCallback(() => {
    creationId.current = null;
    setStep("question");
    setFields(createEmptyExperimentDraft());
    setSelectedIdea(null);
    setError("");
  }, []);
  const attachForm = useCallback(
    (form: HTMLFormElement | null) => {
      formRef.current = form;
      return () => {
        form?.reset();
        reset();
      };
    },
    [reset],
  );
  function applyIdea(idea: ExperimentIdea) {
    reset();
    const draft = createIdeaDraft(idea);
    setFields({
      ...draft,
      metrics: draft.metrics.flatMap((metric) => {
        const available = globalMetrics.find((item) => item.definition.id === metric.id);
        return available ? [available.definition] : [];
      }),
    });
    setSelectedIdea(idea.id);
    formRef.current?.querySelector<HTMLTextAreaElement>('[name="question"]')?.focus();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (step === "question") {
      const result = experimentQuestionSchema.safeParse(fields.question);
      if (!result.success) {
        setError(result.error.issues[0].message);
        return;
      }
      setError("");
      setStep("details");
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = newExperimentSchema.safeParse({
      title: data.get("title"),
      question: data.get("question"),
      habit: data.get("habit"),
      durationDays: Number(data.get("durationDays")),
      metrics: fields.metrics,
      outcomeSource: "global",
    });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setError("");
    setSaving(true);
    try {
      const id = await createExperiment(result.data, (creationId.current ??= crypto.randomUUID()));
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
      {!onboarding && (
        <Link href="/experiments" className="back-link">
          {t.common.back}
        </Link>
      )}
      <PageHeading
        eyebrow={t.form.eyebrow}
        title={onboarding ? t.onboarding.heading : t.form.title}
        description={onboarding ? t.onboarding.description : t.form.description}
      />
      <div className={step === "question" ? "question-first-layout" : "form-layout"}>
        <form
          ref={attachForm}
          noValidate
          onSubmit={submit}
          onReset={reset}
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
              <label htmlFor={fieldId("experiment-question")} className="field-label">
                {t.form.question}
              </label>
              <Textarea
                id={fieldId("experiment-question")}
                name="question"
                placeholder={t.form.questionPlaceholder}
                required
                maxLength={EXPERIMENT_LIMITS.question}
                rows={3}
                value={fields.question}
                onChange={(event) =>
                  setFields((current) => ({ ...current, question: event.target.value }))
                }
              />
            </div>
            {step === "details" && (
              <div className="form-field">
                <label htmlFor={fieldId("experiment-title")} className="field-label">
                  {t.form.name}
                </label>
                <Input
                  autoFocus
                  id={fieldId("experiment-title")}
                  name="title"
                  placeholder={t.form.namePlaceholder}
                  value={fields.title}
                  onChange={(event) =>
                    setFields((current) => ({ ...current, title: event.target.value }))
                  }
                  required
                  maxLength={EXPERIMENT_LIMITS.title}
                />
              </div>
            )}
          </Card>
          {step === "details" && (
            <>
              <Card className="form-card">
                <div className="form-section-title">
                  <span className="step-number">02</span>
                  <div>
                    <h2>{t.form.habitTitle}</h2>
                    <p className="muted">{t.onboarding.habitPrompt}</p>
                  </div>
                </div>
                <div className="form-field">
                  <label htmlFor={fieldId("experiment-habit")} className="field-label">
                    {t.form.habit}
                  </label>
                  <Textarea
                    id={fieldId("experiment-habit")}
                    name="habit"
                    placeholder={t.form.habitPlaceholder}
                    required
                    maxLength={EXPERIMENT_LIMITS.habit}
                    value={fields.habit}
                    onChange={(event) =>
                      setFields((current) => ({ ...current, habit: event.target.value }))
                    }
                    rows={3}
                  />
                </div>
              </Card>
              <Card className="form-card">
                <div className="form-section-title">
                  <span className="step-number">03</span>
                  <div>
                    <h2>{t.form.metricsTitle}</h2>
                    <p className="muted">{t.onboarding.metricsPrompt}</p>
                  </div>
                </div>
                <fieldset className="metric-options">
                  <legend className="sr-only">{t.form.legend}</legend>
                  {globalMetrics.map(({ definition }) => (
                    <label key={definition.id} className="metric-option">
                      <input
                        type="checkbox"
                        name="metrics"
                        value={definition.id}
                        checked={fields.metrics.some((item) => item.id === definition.id)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setFields((current) => ({
                            ...current,
                            metrics: checked
                              ? [...current.metrics, definition]
                              : current.metrics.filter((item) => item.id !== definition.id),
                          }));
                        }}
                      />
                      <span>
                        <strong>{metricLabel(definition)}</strong>
                        <small>{metricDescription(definition)}</small>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <Link href="/account#daily-measures" className="text-link">
                  {t.form.manageMeasures}
                  <Icon name="arrow" />
                </Link>
              </Card>
              <Card className="form-card">
                <div className="form-section-title">
                  <span className="step-number">04</span>
                  <div>
                    <h2>{t.form.duration}</h2>
                    <p className="muted">{t.form.durationHelp}</p>
                  </div>
                </div>
                <div className="form-field">
                  <label htmlFor={fieldId("duration-days")} className="field-label">
                    {t.form.duration}
                  </label>
                  <div className="duration-input">
                    <Input
                      id={fieldId("duration-days")}
                      name="durationDays"
                      type="number"
                      min={EXPERIMENT_LIMITS.minDays}
                      max={EXPERIMENT_LIMITS.maxDays}
                      step={1}
                      required
                      value={fields.durationDays || ""}
                      onChange={(event) =>
                        setFields((current) => ({
                          ...current,
                          durationDays: Number(event.target.value),
                        }))
                      }
                    />
                    <span>{t.form.days}</span>
                  </div>
                </div>
              </Card>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-submit">
            {step === "details" && (
              <Button
                variant="secondary"
                type="button"
                disabled={saving}
                onClick={() => {
                  setStep("question");
                  setError("");
                }}
              >
                {t.onboarding.back}
              </Button>
            )}
            <Button type="submit" disabled={saving}>
              {step === "details" && <Icon name="plus" />}
              {saving
                ? t.form.saving
                : step === "question"
                  ? t.onboarding.continue
                  : t.common.createExperiment}
            </Button>
          </div>
          {step === "question" && (
            <section className="onboarding-ideas" aria-labelledby={fieldId("ideas-title")}>
              <h2 id={fieldId("ideas-title")}>{t.onboarding.ideasTitle}</h2>
              <p className="field-hint">{t.onboarding.ideasNotice}</p>
              <div className="idea-grid">
                {EXPERIMENT_IDEAS.map((idea) => (
                  <Button
                    key={idea.id}
                    type="button"
                    variant="secondary"
                    aria-pressed={selectedIdea === idea.id}
                    onClick={() => applyIdea(idea)}
                  >
                    {idea.label}
                  </Button>
                ))}
              </div>
              {onboarding && sample && (
                <Link href={`/experiments/${sample.id}`} className="text-link">
                  {t.onboarding.sampleLink}
                  <Icon name="arrow" />
                </Link>
              )}
            </section>
          )}
          <p className="form-demo-note">
            <Icon name="info" />
            {t.form.local}
          </p>
        </form>
        {step === "details" && (
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
        )}
      </div>
    </>
  );
}
