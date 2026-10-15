"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/i18n";
import { Button, Card, Input } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { addDays } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { getProgress, groupObservations } from "../model/analytics";
import { extendedDuration } from "../model/lifecycle";
import type { Experiment } from "../model/types";
import { useExperiments } from "../context/experiments-provider";

type DialogAction = "finish" | "extend";

export function ExperimentLifecycle({
  experiment,
  compact = false,
  inline = false,
}: {
  experiment: Experiment;
  compact?: boolean;
  inline?: boolean;
}) {
  const { referenceDate, changeLifecycle, pending } = useExperiments();
  const router = useRouter();
  const [action, setAction] = useState<DialogAction | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const progress = getProgress(experiment, referenceDate);
  async function confirm(additionalDays?: number) {
    await changeLifecycle(
      experiment.id,
      action === "extend"
        ? { type: "extend", additionalDays: additionalDays ?? 0 }
        : { type: "finish" },
    );
    setAction(null);
    if (action === "finish") router.push(`/experiments/${experiment.id}#results`);
    else setFeedback(t.lifecycle.extended);
  }
  async function reopen() {
    setError("");
    try {
      await changeLifecycle(experiment.id, { type: "reopen" });
      setFeedback(t.lifecycle.reopened);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  const content = (
    <>
      {experiment.status === "completed" ? (
        <Button variant="secondary" disabled={pending} onClick={reopen}>
          {t.lifecycle.reopen}
        </Button>
      ) : progress.windowComplete && !compact ? (
        <>
          <h2>{t.lifecycle.windowComplete}</h2>
          {!inline && (
            <>
              <p>{t.lifecycle.recorded(progress.recorded, progress.total)}</p>
              <p className="muted">{t.lifecycle.targetPrompt}</p>
            </>
          )}
          <div className="lifecycle-actions">
            <Button
              disabled={pending}
              onClick={() => {
                setFeedback("");
                setAction("finish");
              }}
            >
              {t.lifecycle.finishResults}
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setFeedback("");
                setAction("extend");
              }}
            >
              {t.lifecycle.keepObserving}
            </Button>
          </div>
        </>
      ) : (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setFeedback("");
            setAction("finish");
          }}
        >
          {t.lifecycle.finish}
        </Button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {feedback && (
        <p className="field-hint" role="status">
          {feedback}
        </p>
      )}
      {action && (
        <LifecycleDialog
          key={action}
          action={action}
          experiment={experiment}
          onDismiss={() => setAction(null)}
          onConfirm={confirm}
        />
      )}
    </>
  );
  return progress.windowComplete && !progress.completed && !compact && !inline ? (
    <Card className="lifecycle-card">{content}</Card>
  ) : (
    <div className={inline ? "lifecycle-controls lifecycle-inline" : "lifecycle-controls"}>
      {content}
    </div>
  );
}

function LifecycleDialog({
  action,
  experiment,
  onDismiss,
  onConfirm,
}: {
  action: DialogAction;
  experiment: Experiment;
  onDismiss: () => void;
  onConfirm: (additionalDays?: number) => Promise<void>;
}) {
  const { referenceDate } = useExperiments();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const daysId = useId();
  const [option, setOption] = useState("7");
  const [customDays, setCustomDays] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const additionalDays = Number(option === "custom" ? customDays : option);
  const progress = getProgress(experiment, referenceDate);
  const groups = groupObservations(experiment.entries);
  let targetDate: string | null = null;
  if (action === "extend") {
    try {
      targetDate = addDays(
        experiment.startDate,
        extendedDuration(experiment, additionalDays, referenceDate) - 1,
      );
    } catch {
      targetDate = null;
    }
  }
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      await onConfirm(action === "extend" ? additionalDays : undefined);
    } catch (cause) {
      setError(errorMessage(cause));
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="entry-dialog lifecycle-dialog"
      aria-labelledby={titleId}
      onClose={(event) => {
        if (!event.currentTarget.open) onDismiss();
      }}
      onCancel={(event) => {
        if (saving) event.preventDefault();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onDismiss();
      }}
    >
      <div className="dialog-content">
        <h2 id={titleId}>
          {action === "finish" ? t.lifecycle.finishConfirm : t.lifecycle.extendTitle}
        </h2>
        <p className="muted">{experiment.title}</p>
        {action === "finish" && <p className="field-hint">{t.lifecycle.finishDescription}</p>}
        <form noValidate onSubmit={submit}>
          {action === "finish" ? (
            <>
              <div className="lifecycle-summary">
                <p>{t.lifecycle.elapsed(progress.elapsedDays)}</p>
                <p>{t.lifecycle.observations(experiment.entries.length)}</p>
                <p>{t.analytics.metricCounts(groups.done.length, groups.notDone.length)}</p>
                <p>
                  {t.lifecycle.missingDays(
                    Math.max(
                      0,
                      Math.min(progress.elapsedDays, experiment.durationDays) -
                        experiment.entries.length,
                    ),
                  )}
                </p>
              </div>
              <p className="field-hint">{t.lifecycle.finishHelp}</p>
            </>
          ) : (
            <>
              <p className="field-hint">{t.lifecycle.extendHelp}</p>
              <fieldset className="habit-options">
                <legend className="field-label">{t.lifecycle.additionalDays}</legend>
                {[
                  { value: "7", label: t.lifecycle.sevenDays },
                  { value: "14", label: t.lifecycle.fourteenDays },
                  { value: "custom", label: t.lifecycle.custom },
                ].map((item) => (
                  <Button
                    key={item.value}
                    type="button"
                    variant={option === item.value ? "primary" : "secondary"}
                    aria-pressed={option === item.value}
                    disabled={saving}
                    onClick={() => setOption(item.value)}
                  >
                    {item.label}
                  </Button>
                ))}
              </fieldset>
              {option === "custom" && (
                <>
                  <label htmlFor={daysId} className="field-label">
                    {t.lifecycle.additionalDays}
                  </label>
                  <Input
                    id={daysId}
                    name="additionalDays"
                    type="number"
                    min={1}
                    max={365}
                    step={1}
                    value={customDays}
                    disabled={saving}
                    onChange={(event) => setCustomDays(event.target.value)}
                  />
                </>
              )}
              {targetDate && (
                <p className="field-hint">
                  {t.lifecycle.newTarget(
                    formatDate(targetDate, { day: "numeric", month: "long", year: "numeric" }),
                  )}
                </p>
              )}
              <p className="field-hint">{t.lifecycle.targetLimit}</p>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <Button variant="secondary" type="button" disabled={saving} onClick={onDismiss}>
              {action === "finish" ? t.lifecycle.keepObserving : t.common.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? t.lifecycle.saving
                : action === "finish"
                  ? t.lifecycle.finishResults
                  : t.lifecycle.extend}
            </Button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
