import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { builtInMetric, metricDescription } from "../src/features/experiments/model/metrics";
import { buildExperiment, buildDailyEntry } from "../src/features/experiments/model/actions";
import { compareMetric } from "../src/features/experiments/model/analytics";
import { outcomeEntries } from "../src/features/reflections/model/analytics";
import { sliderPosition, sliderTicks } from "../src/features/experiments/model/slider-geometry";
import { DEFAULT_NUMERIC_SCALE } from "../src/features/experiments/model/types";
import { MetricSlider } from "../src/features/experiments/components/metric-slider";

test("global outcomes join only days with a Done or Not done check-in", () => {
  const experiment = buildExperiment(
    {
      title: "Walks",
      question: "How do walks relate to mood?",
      habit: "Walk",
      durationDays: 14,
      metrics: [builtInMetric("mood")],
      outcomeSource: "global",
    },
    "walks",
    "2026-10-14",
  );
  experiment.entries = [
    buildDailyEntry(
      experiment,
      { habitStatus: "done", values: {} },
      "one",
      "2026-10-14",
      "2026-10-14",
    ),
    buildDailyEntry(
      experiment,
      { habitStatus: "not_done", values: {} },
      "two",
      "2026-10-15",
      "2026-10-15",
    ),
    buildDailyEntry(
      experiment,
      { habitStatus: "done", values: {} },
      "three",
      "2026-10-16",
      "2026-10-16",
    ),
  ];
  const reflections = [
    {
      id: crypto.randomUUID(),
      observedDate: "2026-10-14",
      values: { mood: 8 },
      note: "",
      recordedAt: "2026-10-14T12:00:00.000Z",
      updatedAt: null,
    },
    {
      id: crypto.randomUUID(),
      observedDate: "2026-10-15",
      values: { mood: 4 },
      note: "",
      recordedAt: "2026-10-15T12:00:00.000Z",
      updatedAt: null,
    },
    {
      id: crypto.randomUUID(),
      observedDate: "2026-10-17",
      values: { mood: 10 },
      note: "",
      recordedAt: "2026-10-17T12:00:00.000Z",
      updatedAt: null,
    },
  ];
  const joined = outcomeEntries(experiment, reflections);
  assert.deepEqual(
    joined.map((entry) => entry.values.mood),
    [8, 4, undefined],
  );
  const result = compareMetric(joined, "mood");
  assert.equal(result.done.count, 1);
  assert.equal(result.notDone.count, 1);
  assert.equal(result.done.average, 8);
  assert.equal(result.notDone.average, 4);
  assert.equal(result.missingScores.done, 1);
  assert.deepEqual(
    experiment.entries.map((entry) => entry.values),
    [{}, {}, {}],
  );
});

test("scoped historical scores stay unchanged when global reflections exist", () => {
  const experiment = buildExperiment(
    {
      title: "Legacy",
      question: "Mood?",
      habit: "Walk",
      durationDays: 14,
      metrics: [builtInMetric("mood")],
    },
    "legacy",
    "2026-10-14",
  );
  experiment.entries = [
    buildDailyEntry(
      experiment,
      { habitStatus: "done", values: { mood: 7 } },
      "one",
      "2026-10-14",
      "2026-10-14",
    ),
  ];
  assert.deepEqual(
    outcomeEntries(experiment, [
      {
        id: crypto.randomUUID(),
        observedDate: "2026-10-14",
        values: { mood: 2 },
        note: "",
        recordedAt: "2026-10-14T12:00:00.000Z",
        updatedAt: null,
      },
    ]),
    experiment.entries,
  );
});

test("slider geometry maps first, last and intermediate ticks exactly", () => {
  assert.deepEqual(sliderTicks(DEFAULT_NUMERIC_SCALE), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(sliderPosition(1, DEFAULT_NUMERIC_SCALE), 0);
  assert.equal(sliderPosition(10, DEFAULT_NUMERIC_SCALE), 100);
  assert.equal(sliderPosition(5, DEFAULT_NUMERIC_SCALE), 400 / 9);
});

test("custom labels use neutral helper copy regardless of language", () => {
  const metric = {
    id: `custom_${crypto.randomUUID()}` as const,
    kind: "custom" as const,
    label: "Уверенность в языке",
    scale: DEFAULT_NUMERIC_SCALE,
  };
  assert.equal(metricDescription(metric), "Rate this for today.");
  const html = renderToStaticMarkup(
    createElement(MetricSlider, { metric, value: 7, onChange: () => undefined }),
  );
  assert.match(html, /Уверенность в языке/);
  assert.match(html, /Rate this for today\./);
  assert.doesNotMatch(html, /How would you rate Уверенность/);
});
