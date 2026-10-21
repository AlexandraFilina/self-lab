"use client";

import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { t } from "@/i18n";
import { errorMessage } from "@/lib/errors";
import { useExperiments } from "@/features/experiments/context/experiments-provider";
import { metricLabel, normalizeMetricLabel } from "@/features/experiments/model/metrics";
import { useClientReady } from "@/features/auth/use-client-ready";

export function DailyMeasuresManager() {
  const ready = useClientReady();
  const { globalMetrics, changeGlobalMetric, status } = useExperiments();
  const canEdit = ready && status === "ready";
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function change(action: Parameters<typeof changeGlobalMetric>[0]) {
    if (pending || !canEdit) return;
    setPending(true);
    setError("");
    try {
      await changeGlobalMetric(action);
      setAdding(false);
      setNewName("");
      setRenaming(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  function duplicate(label: string, id?: string) {
    return globalMetrics.some(
      (item) =>
        item.definition.id !== id &&
        (normalizeMetricLabel(metricLabel(item.definition)) === normalizeMetricLabel(label) ||
          (item.definition.kind === "built_in" &&
            normalizeMetricLabel(item.definition.id) === normalizeMetricLabel(label))),
    );
  }
  function create() {
    const label = newName.trim();
    if (!label) return setError(t.validation.customMetricName);
    if (duplicate(label)) return setError(t.errors.metricDuplicate);
    void change({ type: "create", id: `custom_${crypto.randomUUID()}`, label });
  }
  function rename() {
    const label = renameName.trim();
    if (!renaming || !label) return setError(t.validation.customMetricName);
    if (duplicate(label, renaming)) return setError(t.errors.metricDuplicate);
    void change({ type: "rename", id: renaming, label });
  }
  return (
    <Card id="daily-measures" className="daily-measures account-card">
      <h2>{t.measures.title}</h2>
      <p className="muted">{t.measures.help}</p>
      <ul>
        {globalMetrics.map(({ definition, active }) => (
          <li key={definition.id}>
            <div>
              <strong>{metricLabel(definition)}</strong>
              <small>{active ? t.measures.active : t.measures.inactive}</small>
            </div>
            <div className="daily-measure-actions">
              {definition.kind === "custom" && (
                <Button
                  variant="ghost"
                  disabled={!canEdit || pending}
                  onClick={() => {
                    setRenaming(definition.id);
                    setRenameName(definition.label);
                  }}
                >
                  {t.measures.rename}
                </Button>
              )}
              <Button
                variant="secondary"
                disabled={!canEdit || pending}
                onClick={() =>
                  void change({ type: "setActive", id: definition.id, active: !active })
                }
              >
                {active ? t.measures.archive : t.measures.enable}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {renaming && (
        <div className="daily-measure-editor">
          <label className="field-label" htmlFor="rename-measure">
            {t.measures.name}
          </label>
          <Input
            id="rename-measure"
            maxLength={40}
            value={renameName}
            onChange={(event) => setRenameName(event.target.value)}
          />
          <Button variant="secondary" disabled={!canEdit || pending} onClick={rename}>
            {t.measures.saveName}
          </Button>
          <Button variant="ghost" disabled={!canEdit || pending} onClick={() => setRenaming(null)}>
            {t.common.cancel}
          </Button>
        </div>
      )}
      {adding ? (
        <div className="daily-measure-editor">
          <label className="field-label" htmlFor="new-measure">
            {t.measures.name}
          </label>
          <Input
            id="new-measure"
            maxLength={40}
            placeholder={t.measures.namePlaceholder}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <Button variant="secondary" disabled={!canEdit || pending} onClick={create}>
            {t.measures.create}
          </Button>
          <Button variant="ghost" disabled={!canEdit || pending} onClick={() => setAdding(false)}>
            {t.common.cancel}
          </Button>
        </div>
      ) : (
        <Button variant="ghost" disabled={!canEdit || pending} onClick={() => setAdding(true)}>
          {t.measures.add}
        </Button>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </Card>
  );
}
