import { APP_LOCALE } from "./config";

export function formatNumber(value: number) {
  return new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 1 }).format(value);
}

export function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${formatNumber(count)} ${Math.abs(count) === 1 ? singular : plural}`;
}

export function formatDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) {
  return new Intl.DateTimeFormat(APP_LOCALE, { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
