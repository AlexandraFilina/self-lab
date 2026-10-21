"use client";
import { useExperiments } from "@/features/experiments/context/experiments-provider";
import { t } from "@/i18n";
import { Button, Card } from "./ui";

export function LocalDataBoundary({ children }: { children: React.ReactNode }) {
  const { status, error, reload } = useExperiments();
  if (status === "loading")
    return (
      <Card className="empty-state">
        <p role="status">{t.storage.loading}</p>
      </Card>
    );
  if (status === "error")
    return (
      <Card className="empty-state">
        <h1>{t.storage.errorTitle}</h1>
        <p role="alert">{error}</p>
        <p>{t.storage.errorHelp}</p>
        <Button onClick={reload}>{t.common.retry}</Button>
      </Card>
    );
  return (
    <>
      {error && (
        <div className="storage-error">
          <p role="alert">{error}</p>
        </div>
      )}
      {children}
    </>
  );
}
