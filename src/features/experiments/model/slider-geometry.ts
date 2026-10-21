import type { NumericScale } from "./types";

export function sliderPosition(value: number, scale: NumericScale) {
  return ((value - scale.min) / (scale.max - scale.min)) * 100;
}

export function sliderTicks(scale: NumericScale) {
  return Array.from(
    { length: Math.round((scale.max - scale.min) / scale.step) + 1 },
    (_, index) => scale.min + index * scale.step,
  );
}
