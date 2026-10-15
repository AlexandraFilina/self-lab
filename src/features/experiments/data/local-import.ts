import { AppError } from "@/lib/errors";
import { decodeWorkspace } from "./migration";
import { STORAGE_KEY, type StoragePort } from "./local-storage-repository";
export function readLocalExperiments(storage: Pick<StoragePort, "getItem">) {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    throw new AppError("storageRead");
  }
  return raw === null
    ? []
    : decodeWorkspace(raw).experiments.filter((experiment) => experiment.source === "user");
}
