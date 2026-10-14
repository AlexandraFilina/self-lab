"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { EXPERIMENT_LIMITS, getDailyEntrySchema } from "../model/schemas";
import { METRICS } from "@/features/experiments/model/metrics";
import { formatDate } from "@/lib/format";
import { getProgress } from "@/features/experiments/model/analytics";
import type { Experiment, MetricId } from "@/features/experiments/model/types";
import { useExperiments } from "@/features/experiments/context/experiments-provider";
import { Icon } from "@/components/icon";
import { Button, Textarea } from "@/components/ui";

export function DailyEntryButton({
  experiment,
  className,
  compact = false,
}: {
  experiment: Experiment;
  className?: string;
  compact?: boolean;
}) {
  const { referenceDate } = useExperiments();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const existing = experiment.entries.some((entry) => entry.date === referenceDate);
  if (getProgress(experiment, referenceDate).completed) return null;
  return (
    <div className={className}>
      <Button
        className="entry-button"
        onClick={() => {
          setSaved(false);
          setOpen(true);
        }}
      >
        <Icon name={existing ? "check" : "plus"} />
        {existing ? "Edit check-in" : compact ? "Check in" : "Check in today"}
      </Button>
      {saved && (
        <p className="save-feedback" role="status">
          Check-in saved for this demo session.
        </p>
      )}
      {open && (
        <EntryDialog
          experiment={experiment}
          onDismiss={() => setOpen(false)}
          onSaved={() => {
            setSaved(true);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function EntryDialog({
  experiment,
  onDismiss,
  onSaved,
}: {
  experiment: Experiment;
  onDismiss: () => void;
  onSaved: () => void;
}) {
  const { saveEntry, referenceDate } = useExperiments();
  const dialog = useRef<HTMLDialogElement>(null);
  const existing = experiment.entries.find((entry) => entry.date === referenceDate);
  const [values, setValues] = useState<Partial<Record<MetricId, number>>>(() =>
    Object.fromEntries(experiment.metrics.map((metric) => [metric, existing?.values[metric] ?? 5])),
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
    };
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = getDailyEntrySchema(experiment.metrics).safeParse({ values, note });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    try {
      saveEntry(experiment.id, result.data);
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save your check-in. Please try again.",
      );
    }
  }

  return (
    <dialog
      ref={dialog}
      className="entry-dialog"
      aria-labelledby="entry-title"
      aria-describedby="entry-description"
      onClose={onDismiss}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div className="dialog-content">
        <div className="section-heading">
          <span className="eyebrow">DAILY OBSERVATION</span>
          <Button variant="ghost" aria-label="Close" onClick={onDismiss}>
            <Icon name="close" />
          </Button>
        </div>
        <h2 id="entry-title">How was your day?</h2>
        <p id="entry-description" className="muted">
          {experiment.title} · {formatDate(referenceDate, { day: "numeric", month: "long" })}
        </p>
        <form onSubmit={submit}>
          <div className="metric-sliders">
            {experiment.metrics.map((metric) => (
              <div key={metric} className="metric-slider">
                <div className="section-heading">
                  <label htmlFor={`score-${metric}`}>{METRICS[metric].label}</label>
                  <output htmlFor={`score-${metric}`} className="score-output">
                    {values[metric]}
                    <span> / 10</span>
                  </output>
                </div>
                <p className="muted">{METRICS[metric].description}</p>
                <input
                  id={`score-${metric}`}
                  type="range"
                  min={EXPERIMENT_LIMITS.minScore}
                  max={EXPERIMENT_LIMITS.maxScore}
                  step="1"
                  value={values[metric]}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [metric]: Number(event.target.value) }))
                  }
                  aria-valuetext={`${values[metric]} out of 10`}
                />
                <div className="range-labels">
                  <span>1 — low score</span>
                  <span>10 — high score</span>
                </div>
              </div>
            ))}
          </div>
          <label htmlFor="entry-note" className="field-label">
            Note <span className="optional">optional</span>
          </label>
          <Textarea
            id="entry-note"
            placeholder="What might have influenced your scores?"
            value={note}
            maxLength={EXPERIMENT_LIMITS.note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
          />
          <p className="form-demo-note">
            <Icon name="info" />
            Demo mode: your entry is kept until you reload the page.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={onDismiss}>
              Cancel
            </Button>
            <Button type="submit">
              <Icon name="check" />
              Save check-in
            </Button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
