"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { EXPERIMENT_LIMITS, newExperimentSchema } from "../model/schemas";
import { METRICS } from "@/features/experiments/model/metrics";
import type { MetricId } from "@/features/experiments/model/types";
import { useExperiments } from "@/features/experiments/context/experiments-provider";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { Button, Card, Input, Textarea, cn } from "@/components/ui";

export function NewExperimentForm() {
  const router = useRouter();
  const { createExperiment } = useExperiments();
  const [metrics, setMetrics] = useState<MetricId[]>(["sleep", "mood", "productivity"]);
  const [durationA, setDurationA] = useState("14");
  const [durationB, setDurationB] = useState("14");
  const [error, setError] = useState("");
  const total = Number(durationA) + Number(durationB);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    const hypothesis = String(data.get("hypothesis") ?? "").trim();
    const conditionA = String(data.get("conditionA") ?? "").trim();
    const conditionB = String(data.get("conditionB") ?? "").trim();
    const result = newExperimentSchema.safeParse({
      title,
      hypothesis,
      conditionA,
      conditionB,
      durationA: Number(durationA),
      durationB: Number(durationB),
      metrics,
    });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    const id = createExperiment(result.data);
    router.push(`/experiments/${id}`);
  }

  return (
    <>
      <Link href="/experiments" className="back-link">
        ← Back to experiments
      </Link>
      <PageHeading
        eyebrow="A NEW EXPLORATION"
        title="Start with curiosity"
        description="Ask a question, change one habit, and observe."
      />
      <div className="form-layout">
        <form onSubmit={submit} className="experiment-form">
          <Card className="form-card">
            <div className="form-section-title">
              <span className="step-number">01</span>
              <div>
                <h2>What would you like to learn?</h2>
                <p className="muted">A clear question helps you stay focused.</p>
              </div>
            </div>
            <div className="form-field">
              <label htmlFor="experiment-title" className="field-label">
                Experiment name
              </label>
              <Input
                id="experiment-title"
                name="title"
                placeholder="For example: how does early sleep relate to my day?"
                required
                maxLength={EXPERIMENT_LIMITS.title}
              />
            </div>
            <div className="form-field">
              <label htmlFor="experiment-hypothesis" className="field-label">
                Your hypothesis
              </label>
              <Textarea
                id="experiment-hypothesis"
                name="hypothesis"
                placeholder="If I go to bed before 11 pm, I might feel more rested…"
                required
                maxLength={EXPERIMENT_LIMITS.hypothesis}
                rows={3}
              />
              <p className="field-hint">
                An idea you want to explore through your own observations.
              </p>
            </div>
          </Card>
          <Card className="form-card">
            <div className="form-section-title">
              <span className="step-number">02</span>
              <div>
                <h2>Two periods to compare</h2>
                <p className="muted">Your usual routine first, then one change.</p>
              </div>
            </div>
            <div className="conditions-grid">
              <div className="condition-field">
                <div className="condition-label">
                  <span className="period-letter">A</span>
                  <strong>Usual routine</strong>
                </div>
                <label htmlFor="condition-a" className="field-label">
                  Period A conditions
                </label>
                <Textarea
                  id="condition-a"
                  name="conditionA"
                  placeholder="For example: keep my usual bedtime."
                  required
                  maxLength={EXPERIMENT_LIMITS.condition}
                  rows={3}
                />
                <label htmlFor="duration-a" className="field-label duration-label">
                  Duration
                </label>
                <div className="duration-input">
                  <Input
                    id="duration-a"
                    name="durationA"
                    type="number"
                    min={EXPERIMENT_LIMITS.minPeriodDays}
                    max={EXPERIMENT_LIMITS.maxPeriodDays}
                    step={1}
                    required
                    value={durationA}
                    onChange={(event) => setDurationA(event.target.value)}
                  />
                  <span>days</span>
                </div>
              </div>
              <div className="condition-field condition-b">
                <div className="condition-label">
                  <span className="period-letter">B</span>
                  <strong>New conditions</strong>
                </div>
                <label htmlFor="condition-b" className="field-label">
                  Period B conditions
                </label>
                <Textarea
                  id="condition-b"
                  name="conditionB"
                  placeholder="For example: go to bed before 11 pm and put my phone away earlier."
                  required
                  maxLength={EXPERIMENT_LIMITS.condition}
                  rows={3}
                />
                <label htmlFor="duration-b" className="field-label duration-label">
                  Duration
                </label>
                <div className="duration-input">
                  <Input
                    id="duration-b"
                    name="durationB"
                    type="number"
                    min={EXPERIMENT_LIMITS.minPeriodDays}
                    max={EXPERIMENT_LIMITS.maxPeriodDays}
                    step={1}
                    required
                    value={durationB}
                    onChange={(event) => setDurationB(event.target.value)}
                  />
                  <span>days</span>
                </div>
              </div>
            </div>
            <p className="form-duration-note">
              <Icon name="calendar" />
              {durationA && durationB && total >= 2 && total <= 180
                ? `${total} days of observations in total`
                : "Choose 1–90 days for each period"}
            </p>
          </Card>
          <Card className="form-card">
            <div className="form-section-title">
              <span className="step-number">03</span>
              <div>
                <h2>What will you track?</h2>
                <p className="muted">Choose at least one metric. Scores range from 1 to 10.</p>
              </div>
            </div>
            <fieldset className="metric-options">
              <legend className="sr-only">Experiment metrics</legend>
              {(Object.keys(METRICS) as MetricId[]).map((metric) => (
                <label
                  key={metric}
                  className={cn(
                    "metric-option",
                    metrics.includes(metric) && "metric-option-selected",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={metrics.includes(metric)}
                    onChange={(event) => {
                      setMetrics((current) =>
                        event.target.checked
                          ? [...current, metric]
                          : current.filter((value) => value !== metric),
                      );
                      setError("");
                    }}
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
            <Link href="/experiments" className="button button-secondary">
              Cancel
            </Link>
            <Button type="submit">
              <Icon name="plus" />
              Create experiment
            </Button>
          </div>
          <p className="form-demo-note">
            <Icon name="info" />
            Demo mode: your experiment stays available until you reload the page.
          </p>
        </form>
        <aside className="form-advice">
          <Card>
            <span className="icon-tile">
              <Icon name="sparkles" />
            </span>
            <h2>Keep it simple</h2>
            <p>Change one thing at a time to make your comparison easier to interpret.</p>
            <div className="advice-item">
              <span>1</span>
              <p>Choose a change you can repeat every day.</p>
            </div>
            <div className="advice-item">
              <span>2</span>
              <p>Give each period enough time. Two 14-day periods are a good starting point.</p>
            </div>
            <div className="advice-item">
              <span>3</span>
              <p>Use the same scoring approach and note any relevant circumstances.</p>
            </div>
            <div className="insight-note">
              <Icon name="info" />
              <p>These are personal observations, not evidence of cause and effect.</p>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
