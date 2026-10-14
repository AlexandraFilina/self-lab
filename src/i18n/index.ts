import { en } from "./en";

type Dictionary<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : T[K] extends string
      ? string
      : T[K] extends readonly string[]
        ? readonly string[]
        : Dictionary<T[K]>;
};
export type Messages = Dictionary<typeof en>;
export type ErrorCode = keyof typeof en.errors;
export const locale = "en-US";
export const t: Messages = en;
