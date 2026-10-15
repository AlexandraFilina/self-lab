import { AppError } from "@/lib/errors";
import { workspaceSchema } from "../model/schemas";
import type { Experiment } from "../model/types";
import type { WorkspaceSnapshotRepository } from "./repository";
import { decodeWorkspace } from "./migration";

export const STORAGE_KEY = "self-lab:experiments";
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function createLocalStorageRepository(storage: StoragePort): WorkspaceSnapshotRepository {
  let lastRead: string | null | undefined;
  const read = () => {
    try {
      return storage.getItem(STORAGE_KEY);
    } catch {
      throw new AppError("storageRead");
    }
  };
  const save = async (experiments: readonly Experiment[]) => {
    if (lastRead === undefined) throw new AppError("loading");
    const parsed = workspaceSchema.safeParse({ version: 5, experiments });
    if (!parsed.success) throw new AppError("storageCorrupt");
    const serialized = JSON.stringify(parsed.data);
    if (read() !== lastRead) throw new AppError("staleStorage");
    try {
      storage.setItem(STORAGE_KEY, serialized);
    } catch {
      throw new AppError("storageWrite");
    }
    lastRead = serialized;
  };
  return {
    async load() {
      lastRead = undefined;
      const raw = read();
      if (raw === null) {
        lastRead = null;
        return null;
      }
      const decoded = decodeWorkspace(raw);
      lastRead = raw;
      if (decoded.migrated) await save(decoded.experiments);
      return decoded.experiments;
    },
    save,
  };
}
