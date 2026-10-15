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
import { applyLifecycle, type LifecycleIntent } from "../model/lifecycle";
import { buildDailyEntry, buildExperiment, experimentsReducer } from "../model/actions";
import { createLocalStorageRepository } from "../data/local-storage-repository";
import { createSampleExperiments, ensureCompletedSample } from "../data/mock-experiments";
import type { ExperimentsRepository } from "../data/repository";
import type { DailyEntryDraft, Experiment, NewExperiment } from "../model/types";

interface ExperimentsContextValue {
  experiments: Experiment[];
  referenceDate: string;
  status: "loading" | "ready" | "error";
  error: string | null;
  pending: boolean;
  reload: () => void;
  createExperiment: (draft: NewExperiment) => Promise<string>;
  saveEntry: (experimentId: string, entry: DailyEntryDraft, date?: string) => Promise<void>;
  changeLifecycle: (experimentId: string, intent: LifecycleIntent) => Promise<void>;
}
const ExperimentsContext = createContext<ExperimentsContextValue | null>(null);
export function ExperimentsProvider({ children }: { children: ReactNode }) {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [referenceDate, setReferenceDate] = useState("");
  const [status, setStatus] = useState<ExperimentsContextValue["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const repository = useRef<ExperimentsRepository | null>(null);
  const current = useRef<Experiment[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pendingCount = useRef(0);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        let adapter: ExperimentsRepository;
        try {
          adapter = createLocalStorageRepository(window.localStorage);
        } catch {
          throw new AppError("storageUnavailable");
        }
        const saved = await adapter.load();
        if (cancelled) return;
        const today = localDate();
        const loaded =
          saved === null ? createSampleExperiments(today) : ensureCompletedSample(saved, today);
        if (saved === null || loaded !== saved) await adapter.save(loaded);
        if (cancelled) return;
        repository.current = adapter;
        current.current = loaded;
        setExperiments(loaded);
        setReferenceDate(today);
        setError(null);
        setStatus("ready");
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
    setLoadVersion((version) => version + 1);
  }, []);
  const commit = useCallback((update: (state: Experiment[]) => Experiment[]) => {
    pendingCount.current++;
    setPending(true);
    const operation = queue.current.then(async () => {
      const adapter = repository.current;
      if (!adapter) throw new AppError("loading");
      const next = update(current.current);
      await adapter.save(next);
      current.current = next;
      setExperiments(next);
      setReferenceDate(localDate());
      setError(null);
    });
    queue.current = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation
      .catch((cause) => {
        setError(errorMessage(cause));
        throw cause;
      })
      .finally(() => {
        pendingCount.current--;
        setPending(pendingCount.current > 0);
      });
  }, []);
  const createExperiment = useCallback(
    async (draft: NewExperiment) => {
      const id = crypto.randomUUID();
      await commit((state) =>
        experimentsReducer(state, {
          type: "experimentCreated",
          experiment: buildExperiment(draft, id, localDate()),
        }),
      );
      return id;
    },
    [commit],
  );
  const saveEntry = useCallback(
    async (experimentId: string, draft: DailyEntryDraft, date?: string) => {
      await commit((state) => {
        const experiment = state.find((item) => item.id === experimentId);
        if (!experiment) throw new AppError("experimentMissing");
        const now = new Date();
        const today = localDate(now);
        const entry = buildDailyEntry(
          experiment,
          draft,
          crypto.randomUUID(),
          date ?? today,
          today,
          now.toISOString(),
        );
        return experimentsReducer(state, { type: "entrySaved", experimentId, entry });
      });
    },
    [commit],
  );
  const changeLifecycle = useCallback(
    async (experimentId: string, intent: LifecycleIntent) => {
      await commit((state) => {
        const experiment = state.find((item) => item.id === experimentId);
        if (!experiment) throw new AppError("experimentMissing");
        const now = new Date();
        const command =
          intent.type === "finish"
            ? { ...intent, completedAt: now.toISOString() }
            : intent.type === "extend"
              ? { ...intent, today: localDate(now), extendedAt: now.toISOString() }
              : intent;
        return experimentsReducer(state, {
          type: "experimentUpdated",
          experiment: applyLifecycle(experiment, command),
        });
      });
    },
    [commit],
  );
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
    ],
  );
  return <ExperimentsContext.Provider value={value}>{children}</ExperimentsContext.Provider>;
}
export function useExperiments() {
  const context = useContext(ExperimentsContext);
  if (!context) throw new Error("useExperiments must be used inside ExperimentsProvider.");
  return context;
}
