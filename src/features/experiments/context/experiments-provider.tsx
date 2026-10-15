"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppError, errorMessage } from "@/lib/errors";
import { localDate } from "@/lib/dates";
import type { LifecycleIntent } from "../model/lifecycle";
import { createHttpRepository } from "../data/http-repository";
import { readLocalExperiments } from "../data/local-import";
import { createSampleExperiments } from "../data/mock-experiments";
import type { ExperimentsRepository } from "../data/repository";
import type { DailyEntryDraft, Experiment, NewExperiment } from "../model/types";

interface ExperimentsContextValue {
  experiments: Experiment[];
  referenceDate: string;
  status: "loading" | "ready" | "error";
  error: string | null;
  pending: boolean;
  localImportCount: number;
  localImportError: string | null;
  localImportDone: boolean;
  importLocalExperiments: () => Promise<void>;
  reload: () => void;
  createExperiment: (draft: NewExperiment, requestId?: string) => Promise<string>;
  saveEntry: (experimentId: string, entry: DailyEntryDraft, date?: string) => Promise<void>;
  changeLifecycle: (
    experimentId: string,
    intent: LifecycleIntent,
    requestId?: string,
  ) => Promise<void>;
}
const ExperimentsContext = createContext<ExperimentsContextValue | null>(null);
function withSamples(saved: Experiment[], today: string) {
  return [
    ...saved,
    ...createSampleExperiments(today).filter(
      (sample) => !saved.some((experiment) => experiment.id === sample.id),
    ),
  ];
}
export function ExperimentsProvider({ children }: { children: ReactNode }) {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [referenceDate, setReferenceDate] = useState("");
  const [status, setStatus] = useState<ExperimentsContextValue["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [localImportCount, setLocalImportCount] = useState(0);
  const [localImportError, setLocalImportError] = useState<string | null>(null);
  const [localImportDone, setLocalImportDone] = useState(false);
  const localCandidates = useRef<Experiment[]>([]);
  const repository = useRef<ExperimentsRepository | null>(null);
  const current = useRef<Experiment[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pendingCount = useRef(0);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const adapter = createHttpRepository();
      try {
        const saved = await adapter.listExperiments();
        if (cancelled) return;
        const today = localDate();
        repository.current = adapter;
        current.current = withSamples(saved, today);
        setExperiments(current.current);
        setReferenceDate(today);
        setError(null);
        setStatus("ready");
        try {
          const candidates = readLocalExperiments(window.localStorage);
          const imported = candidates.length ? await adapter.importStatus(candidates) : false;
          if (cancelled) return;
          localCandidates.current = imported ? [] : candidates;
          setLocalImportCount(localCandidates.current.length);
          setLocalImportError(null);
          setLocalImportDone(false);
        } catch (cause) {
          if (!cancelled) setLocalImportError(errorMessage(cause));
        }
      } catch (cause) {
        if (!cancelled) {
          setError(errorMessage(cause));
          setStatus("error");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadVersion]);
  useEffect(() => {
    const update = () => setReferenceDate(localDate());
    const timer = window.setInterval(update, 15000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const reload = useCallback(() => {
    if (pendingCount.current) return;
    setStatus("loading");
    setError(null);
    repository.current = null;
    localCandidates.current = [];
    setLocalImportCount(0);
    setLocalImportError(null);
    setLoadVersion((version) => version + 1);
  }, []);
  const commit = useCallback(
    (operation: (adapter: ExperimentsRepository) => Promise<Experiment>) => {
      pendingCount.current++;
      setPending(true);
      const task = queue.current.then(async () => {
        const adapter = repository.current;
        if (!adapter) throw new AppError("loading");
        const saved = await operation(adapter);
        current.current = current.current.some((experiment) => experiment.id === saved.id)
          ? current.current.map((experiment) => (experiment.id === saved.id ? saved : experiment))
          : [saved, ...current.current];
        setExperiments(current.current);
        setReferenceDate(localDate());
        setError(null);
      });
      queue.current = task.then(
        () => undefined,
        () => undefined,
      );
      return task
        .catch((cause) => {
          setError(errorMessage(cause));
          throw cause;
        })
        .finally(() => {
          pendingCount.current--;
          setPending(pendingCount.current > 0);
        });
    },
    [],
  );
  const createExperiment = useCallback(
    async (draft: NewExperiment, id = crypto.randomUUID()) => {
      await commit((adapter) =>
        adapter.createExperiment({
          id,
          draft,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      );
      return id;
    },
    [commit],
  );
  const assertUser = useCallback((id: string) => {
    const experiment = current.current.find((item) => item.id === id);
    if (!experiment) throw new AppError("experimentMissing");
    if (experiment.source !== "user") throw new AppError("readOnlySample");
  }, []);
  const saveEntry = useCallback(
    async (id: string, draft: DailyEntryDraft, date?: string) => {
      assertUser(id);
      await commit((adapter) =>
        adapter.saveEntry(id, {
          draft,
          observedDate: date ?? localDate(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      );
    },
    [commit, assertUser],
  );
  const changeLifecycle = useCallback(
    async (id: string, intent: LifecycleIntent, requestId = crypto.randomUUID()) => {
      assertUser(id);
      await commit((adapter) =>
        adapter.changeLifecycle(id, {
          intent,
          requestId,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      );
    },
    [commit, assertUser],
  );
  const importLocalExperiments = useCallback(async () => {
    if (pendingCount.current || !localCandidates.current.length) return;
    pendingCount.current++;
    setPending(true);
    setLocalImportError(null);
    const task = queue.current.then(async () => {
      const adapter = repository.current;
      if (!adapter) throw new AppError("loading");
      const candidates = readLocalExperiments(window.localStorage);
      await adapter.importExperiments(candidates);
      const saved = await adapter.listExperiments();
      current.current = withSamples(saved, localDate());
      setExperiments(current.current);
      setReferenceDate(localDate());
      localCandidates.current = [];
      setLocalImportCount(0);
      setLocalImportDone(true);
      setError(null);
    });
    queue.current = task.then(
      () => undefined,
      () => undefined,
    );
    try {
      await task;
    } catch (cause) {
      setLocalImportError(errorMessage(cause));
    } finally {
      pendingCount.current--;
      setPending(pendingCount.current > 0);
    }
  }, []);
  const value = useMemo(
    () => ({
      experiments,
      referenceDate,
      status,
      error,
      pending,
      reload,
      createExperiment,
      saveEntry,
      changeLifecycle,
      localImportCount,
      localImportError,
      localImportDone,
      importLocalExperiments,
    }),
    [
      experiments,
      referenceDate,
      status,
      error,
      pending,
      reload,
      createExperiment,
      saveEntry,
      changeLifecycle,
      localImportCount,
      localImportError,
      localImportDone,
      importLocalExperiments,
    ],
  );
  return <ExperimentsContext.Provider value={value}>{children}</ExperimentsContext.Provider>;
}
export function useExperiments() {
  const context = useContext(ExperimentsContext);
  if (!context) throw new Error("useExperiments must be used inside ExperimentsProvider.");
  return context;
}
