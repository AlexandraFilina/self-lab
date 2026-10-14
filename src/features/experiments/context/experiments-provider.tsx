"use client";

import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import { buildDailyEntry, buildExperiment, experimentsReducer } from "../model/actions";
import type { DailyEntryDraft, Experiment, NewExperiment } from "../model/types";

interface ExperimentsContextValue {
  experiments: Experiment[];
  referenceDate: string;
  createExperiment: (draft: NewExperiment) => string;
  saveEntry: (experimentId: string, entry: DailyEntryDraft) => void;
}

interface ExperimentsProviderProps {
  children: ReactNode;
  initialExperiments: Experiment[];
  referenceDate: string;
}

const ExperimentsContext = createContext<ExperimentsContextValue | null>(null);

export function ExperimentsProvider({
  children,
  initialExperiments,
  referenceDate,
}: ExperimentsProviderProps) {
  const [experiments, dispatch] = useReducer(experimentsReducer, initialExperiments);
  const createExperiment = useCallback(
    (draft: NewExperiment) => {
      const id = crypto.randomUUID();
      dispatch({
        type: "experimentCreated",
        experiment: buildExperiment(draft, id, referenceDate),
      });
      return id;
    },
    [referenceDate],
  );
  const saveEntry = useCallback(
    (experimentId: string, draft: DailyEntryDraft) => {
      const experiment = experiments.find((item) => item.id === experimentId);
      if (!experiment) throw new Error("Experiment not found.");
      const entry = buildDailyEntry(experiment, draft, crypto.randomUUID(), referenceDate);
      dispatch({ type: "entrySaved", experimentId, entry });
    },
    [experiments, referenceDate],
  );
  const value = useMemo(
    () => ({ experiments, referenceDate, createExperiment, saveEntry }),
    [experiments, referenceDate, createExperiment, saveEntry],
  );
  return <ExperimentsContext.Provider value={value}>{children}</ExperimentsContext.Provider>;
}

export function useExperiments() {
  const context = useContext(ExperimentsContext);
  if (!context) throw new Error("useExperiments must be used inside ExperimentsProvider.");
  return context;
}
