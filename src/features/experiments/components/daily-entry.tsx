"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { t } from "@/i18n";
import { errorMessage } from "@/lib/errors";
import { addDays } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { endDate } from "../model/analytics";
import { EXPERIMENT_LIMITS, getDailyEntrySchema } from "../model/schemas";
import type { Experiment, HabitStatus, MetricValues } from "../model/types";
import { useExperiments } from "../context/experiments-provider";
import { MetricSlider } from "./metric-slider";
import { Icon } from "@/components/icon";
import { Button, Textarea, cn } from "@/components/ui";

export function DailyEntryButton({
  experiment,
  className,
  compact = false,
  date,
  row = false,
  variant = "primary",
  label,
  showSavedFeedback = true,
}: {
  experiment: Experiment;
  className?: string;
  compact?: boolean;
  date?: string;
  row?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  label?: string;
  showSavedFeedback?: boolean;
}) {
  const { referenceDate } = useExperiments();
  const [openDate, setOpenDate] = useState<string | null>(null),
    [saved, setSaved] = useState(false);
  const yesterday = referenceDate ? addDays(referenceDate, -1) : "";
  const withinWindow = (candidate: string) =>
    Boolean(
      candidate &&
      candidate <= referenceDate &&
      candidate >= experiment.startDate &&
      candidate <= endDate(experiment),
    );
  const targetDate = date ?? [referenceDate, yesterday].find(withinWindow) ?? "";
  const existing = experiment.entries.some((entry) => entry.observedDate === targetDate);
  const canCheckIn =
    withinWindow(targetDate) &&
    (existing || targetDate >= yesterday) &&
    (experiment.status === "active" || (row && existing));
  if (experiment.source === "sample" || (!canCheckIn && !openDate)) return null;
  return (
    <div className={className}>
      {canCheckIn && (
        <Button
          className="entry-button"
          variant={row ? "ghost" : variant}
          onClick={() => {
            setSaved(false);
            setOpenDate(targetDate);
          }}
        >
          <Icon name={existing ? "check" : "plus"} />
          {label ??
            (row
              ? t.common.edit
              : existing
                ? t.checkIn.edit
                : compact || targetDate !== referenceDate
                  ? t.checkIn.check
                  : t.checkIn.today)}
        </Button>
      )}
      {saved && showSavedFeedback && (
        <p className="save-feedback" role="status">
          {t.checkIn.saved}
        </p>
      )}
      {openDate && (
        <EntryDialog
          key={openDate}
          onSelectDate={date ? undefined : setOpenDate}
          experiment={experiment}
          date={openDate}
          onDismiss={() => setOpenDate(null)}
          onSaved={() => {
            setSaved(true);
            setOpenDate(null);
          }}
        />
      )}
    </div>
  );
}
function EntryDialog({
  experiment,
  date,
  onSelectDate,
  onDismiss,
  onSaved,
}: {
  experiment: Experiment;
  date: string;
  onSelectDate?: (date: string) => void;
  onDismiss: () => void;
  onSaved: () => void;
}) {
  const { saveEntry, referenceDate } = useExperiments();
  const dialog = useRef<HTMLDialogElement>(null);
  const existing = experiment.entries.find((entry) => entry.observedDate === date);
  const [habitStatus, setHabitStatus] = useState<HabitStatus | null>(existing?.habitStatus ?? null);
  const [values, setValues] = useState<MetricValues>(() => ({ ...existing?.values }));
  const [note, setNote] = useState(existing?.note ?? "");
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const result = getDailyEntrySchema(
      experiment.outcomeSource === "global" ? [] : experiment.metrics,
    ).safeParse({ habitStatus, values, note });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setError("");
    setSaving(true);
    try {
      await saveEntry(experiment.id, result.data, date);
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="entry-dialog"
      aria-labelledby="entry-title"
      aria-describedby="entry-description"
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
        <div className="section-heading">
          <span className="eyebrow">{t.checkIn.eyebrow}</span>
          <Button variant="ghost" aria-label={t.common.close} disabled={saving} onClick={onDismiss}>
            <Icon name="close" />
          </Button>
        </div>
        <h2 id="entry-title">
          {experiment.outcomeSource === "global" ? t.checkIn.habitTitle : t.checkIn.title}
        </h2>
        <p id="entry-description" className="muted">
          {experiment.title} · {formatDate(date, { day: "numeric", month: "long" })}
        </p>
        <form noValidate onSubmit={submit}>
          {onSelectDate && (
            <>
              <fieldset className="habit-options">
                <legend className="field-label">{t.checkIn.observationDate}</legend>
                {[
                  { value: referenceDate, label: t.checkIn.todayOption },
                  { value: addDays(referenceDate, -1), label: t.checkIn.yesterdayOption },
                ].map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={date === option.value ? "primary" : "secondary"}
                    aria-pressed={date === option.value}
                    disabled={
                      saving ||
                      option.value < experiment.startDate ||
                      option.value > endDate(experiment)
                    }
                    onClick={() => onSelectDate(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </fieldset>
              <p className="field-hint">{t.checkIn.dateHelp}</p>
            </>
          )}
          <fieldset className="habit-options">
            <legend className="field-label">{t.checkIn.status}</legend>
            {(["done", "not_done"] as const).map((status) => (
              <label
                key={status}
                className={cn("habit-option", habitStatus === status && "habit-selected")}
              >
                <input
                  type="radio"
                  name="habitStatus"
                  value={status}
                  checked={habitStatus === status}
                  required
                  onChange={() => setHabitStatus(status)}
                />
                <Icon name={status === "done" ? "check" : "close"} />
                {status === "done" ? t.common.done : t.common.notDone}
              </label>
            ))}
          </fieldset>
          {existing?.habitStatus === null && <p className="field-hint">{t.checkIn.legacyStatus}</p>}
          {experiment.outcomeSource !== "global" && (
            <>
              <p className="field-hint">{t.checkIn.scoresHelp}</p>
              <div className="metric-sliders">
                {experiment.metrics.map((metric) => (
                  <MetricSlider
                    key={metric.id}
                    metric={metric}
                    value={values[metric.id]}
                    onChange={(value) =>
                      setValues((current) => ({ ...current, [metric.id]: value }))
                    }
                  />
                ))}
              </div>
            </>
          )}
          <label htmlFor="entry-note" className="field-label">
            {t.checkIn.noteLabel} <span className="optional">{t.common.optional}</span>
          </label>
          <Textarea
            id="entry-note"
            placeholder={
              experiment.outcomeSource === "global"
                ? t.checkIn.experimentNotePlaceholder
                : t.checkIn.notePlaceholder
            }
            value={note}
            maxLength={EXPERIMENT_LIMITS.note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
          />
          <p className="form-demo-note">
            <Icon name="info" />
            {t.checkIn.local}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <Button variant="secondary" type="button" disabled={saving} onClick={onDismiss}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              <Icon name="check" />
              {saving ? t.checkIn.saving : t.checkIn.save}
            </Button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
