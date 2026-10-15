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
  } = useExperiments();
  if (!localImportCount && !localImportError && !localImportDone) return null;
  return (
    <Card className="local-import-notice">
      {localImportCount > 0 && (
        <>
          <p>{t.importLocal.found(localImportCount)}</p>
          <p className="field-hint">{t.importLocal.backup}</p>
          <Button variant="secondary" disabled={pending} onClick={importLocalExperiments}>
            {pending ? t.importLocal.moving : t.importLocal.action}
          </Button>
        </>
      )}
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
