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

type DialogAction = "finish" | "extend" | "reopen";

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
  const [feedback, setFeedback] = useState("");
  const progress = getProgress(experiment, referenceDate);
  async function confirm(additionalDays: number | undefined, requestId: string) {
    await changeLifecycle(
      experiment.id,
      action === "extend"
        ? { type: "extend", additionalDays: additionalDays ?? 0 }
        : action === "reopen"
          ? { type: "reopen" }
          : { type: "finish" },
      requestId,
    );
    setAction(null);
    if (action === "finish") router.push(`/experiments/${experiment.id}#results`);
    else setFeedback(action === "reopen" ? t.lifecycle.reopened : t.lifecycle.extended);
  }
  if (experiment.source === "sample") return null;
  const content = (
    <>
      {experiment.status === "completed" ? (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setFeedback("");
            setAction("reopen");
          }}
        >
          {t.lifecycle.reopen}
        </Button>
      ) : progress.windowComplete && !compact ? (
        <>
          <h2>{t.lifecycle.windowComplete}</h2>
          {!inline && <p className="muted">{t.lifecycle.targetPrompt}</p>}
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
  onConfirm: (additionalDays: number | undefined, requestId: string) => Promise<void>;
}) {
  const { referenceDate } = useExperiments();
  const dialog = useRef<HTMLDialogElement>(null);
  const requestId = useRef(crypto.randomUUID());
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
      await onConfirm(action === "extend" ? additionalDays : undefined, requestId.current);
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
          {action === "finish"
            ? t.lifecycle.finishConfirm
            : action === "reopen"
              ? t.lifecycle.reopenConfirm
              : t.lifecycle.extendTitle}
        </h2>
        <p className="muted">{experiment.title}</p>
        {action === "finish" && <p className="field-hint">{t.lifecycle.finishDescription}</p>}
        {action === "reopen" && <p className="field-hint">{t.lifecycle.reopenHelp}</p>}
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
          ) : action === "extend" ? (
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
          ) : null}
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
                  : action === "reopen"
                    ? t.lifecycle.reopenAction
                    : t.lifecycle.extend}
            </Button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
