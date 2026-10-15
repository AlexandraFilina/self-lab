import { locale as APP_LOCALE, t } from "@/i18n";

export function formatNumber(value: number) {
  return new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 1 }).format(value);
}

export function formatCount(count: number, unit: keyof typeof t.common.units) {
  const plural = new Intl.PluralRules(APP_LOCALE).select(Math.abs(count));
  return `${formatNumber(count)} ${t.common.units[unit][plural === "one" ? "one" : "other"]}`;
}

export function formatDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) {
  return new Intl.DateTimeFormat(APP_LOCALE, { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

export function formatRelativePercent(value: number, signed = true): string {
  return new Intl.NumberFormat(APP_LOCALE, {
    style: "percent",
    maximumFractionDigits: 0,
    signDisplay: signed ? "exceptZero" : "never",
  }).format(value / 100);
}
