import { t, type ErrorCode } from "@/i18n";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(code);
    this.name = "AppError";
  }
}
export function errorMessage(error: unknown): string {
  if (error instanceof AppError) return t.errors[error.code];
  if (error instanceof ZodError) return error.issues[0]?.message ?? t.errors.unexpected;
  return t.errors.unexpected;
}
