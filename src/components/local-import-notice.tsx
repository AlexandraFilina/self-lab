"use client";
import { useExperiments } from "@/features/experiments/context/experiments-provider";
import { t } from "@/i18n";
import { Button, Card } from "./ui";
export function LocalImportNotice() {
  const {
    localImportCount,
    localImportError,
    localImportDone,
    importLocalExperiments,
    pending,
    reload,
    status,
  } = useExperiments();
  return (
    <Card className="local-import-notice account-card">
      <h2>{t.importLocal.data}</h2>
      {localImportCount > 0 && (
        <>
          <p>{t.importLocal.found(localImportCount)}</p>
          <p className="field-hint">{t.importLocal.backup}</p>
        </>
      )}
      {status === "loading" && <p className="field-hint">{t.storage.loading}</p>}
      {status === "error" && <p className="field-hint">{t.storage.errorTitle}</p>}
      {status === "ready" && !localImportCount && !localImportDone && !localImportError && (
        <p className="field-hint">{t.importLocal.none}</p>
      )}
      <Button
        variant="secondary"
        disabled={pending || status !== "ready" || !localImportCount}
        onClick={importLocalExperiments}
      >
        {pending ? t.importLocal.moving : t.importLocal.action}
      </Button>
      {localImportDone && <p role="status">{t.importLocal.done}</p>}
      {localImportError && (
        <>
          <p className="form-error" role="alert">
            {localImportError}
          </p>
          {!localImportCount && (
            <Button variant="secondary" disabled={pending} onClick={reload}>
              {t.common.retry}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
