import { versionFourExperiment } from "./storage-fixtures";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildCustomMetric,
  buildDailyEntry,
  buildExperiment,
  experimentsReducer,
} from "../src/features/experiments/model/actions";
import { builtInMetric, metricLabel } from "../src/features/experiments/model/metrics";
import {
  newExperimentSchema,
  metricDefinitionSchema,
} from "../src/features/experiments/model/schemas";
import { compareMetric, comparisonText } from "../src/features/experiments/model/analytics";
import {
  createLocalStorageRepository,
  STORAGE_KEY,
  type StoragePort,
} from "../src/features/experiments/data/local-storage-repository";
import { adaptLegacyExperiment } from "../src/features/experiments/data/migration";
import { LEGACY_EXPERIMENTS } from "../src/features/experiments/data/legacy-experiments";
import { createSampleExperiments } from "../src/features/experiments/data/mock-experiments";
import { MetricChart } from "../src/features/experiments/components/metric-chart";
import type { DailyEntry, NewExperiment } from "../src/features/experiments/model/types";
import { t } from "../src/i18n";

const TODAY = "2026-10-14";
const focus = buildCustomMetric("  Focus  ", "00000000-0000-4000-8000-000000000001");
const draft: NewExperiment = {
  title: "A quieter morning",
  question: "How does this habit relate to focus?",
  habit: "Read before work",
  durationDays: 14,
  metrics: [focus],
};
const experiment = buildExperiment(draft, "custom-experiment", TODAY);
function memoryStorage(): StoragePort {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

test("an experiment without selected metrics is rejected without inserting Mood", () => {
  const result = newExperimentSchema.safeParse({ ...draft, metrics: [] });
  assert.equal(result.success, false);
  if (!result.success)
    assert.equal(result.error.issues[0].message, "Choose at least one metric to track.");
  assert.deepEqual(experiment.metrics, [focus]);
});
test("custom metric names are trimmed, bounded, required, and independent of their stable UUID", () => {
  assert.equal(focus.label, "Focus");
  assert.match(focus.id, /^custom_[\da-f-]+$/);
  assert.notEqual(focus.id, focus.label);
  for (const label of ["", "   ", "x".repeat(41)])
    assert.throws(() => buildCustomMetric(label, "00000000-0000-4000-8000-000000000002"));
  assert.throws(() => buildCustomMetric("Focus", "Focus"));
  assert.deepEqual(focus.scale, { kind: "numeric", min: 1, max: 10, step: 1 });
});
test("case-insensitive duplicate custom and selected built-in names are rejected", () => {
  const duplicate = buildCustomMetric(" fOcUs ", "00000000-0000-4000-8000-000000000002");
  for (const metrics of [
    [focus, duplicate],
    [focus, focus],
    [builtInMetric("mood"), buildCustomMetric(" MOOD ", "00000000-0000-4000-8000-000000000003")],
    [builtInMetric("sleep"), buildCustomMetric("sleep", "00000000-0000-4000-8000-000000000003")],
  ])
    assert.equal(newExperimentSchema.safeParse({ ...draft, metrics }).success, false);
});
test("custom observations persist by metric ID and edit the same date without duplication", async () => {
  const storage = memoryStorage(),
    repository = createLocalStorageRepository(storage);
  await repository.load();
  const first = buildDailyEntry(
    experiment,
    { habitStatus: "done", values: { [focus.id]: 8 } },
    "first",
    TODAY,
    TODAY,
    "2026-10-14T19:00:00.000Z",
  );
  const saved = experimentsReducer([experiment], {
    type: "entrySaved",
    experimentId: experiment.id,
    entry: first,
  });
  await repository.save(saved);
  const reloaded = await createLocalStorageRepository(storage).load();
  assert.deepEqual(reloaded, saved);
  assert.equal(reloaded?.[0].entries[0].values[focus.id], 8);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}").version, 5);
  const edit = buildDailyEntry(
    saved[0],
    { habitStatus: "not_done", values: { [focus.id]: 4 } },
    "new-id",
    TODAY,
    TODAY,
  );
  const updated = experimentsReducer(saved, {
    type: "entrySaved",
    experimentId: experiment.id,
    entry: edit,
  });
  assert.equal(updated[0].entries.length, 1);
  assert.equal(updated[0].entries[0].id, "first");
  assert.equal(updated[0].entries[0].values[focus.id], 4);
  assert.throws(() =>
    buildDailyEntry(experiment, { habitStatus: "done", values: { mood: 5 } }, "id", TODAY, TODAY),
  );
  for (const value of [0, 11, 4.5, NaN, Infinity])
    assert.throws(() =>
      buildDailyEntry(
        experiment,
        { habitStatus: "done", values: { [focus.id]: value } },
        "id",
        TODAY,
        TODAY,
      ),
    );
});
test("analytics groups and compares custom values by ID with a separate display label", () => {
  const entries: DailyEntry[] = Array.from({ length: 10 }, (_, i) => ({
    id: `row-${i}`,
    observedDate: `2026-10-${String(i + 1).padStart(2, "0")}`,
    recordedAt: null,
    updatedAt: null,
    habitStatus: i < 5 ? "done" : "not_done",
    values: { [focus.id]: i < 5 ? 8 : 5 },
    note: "",
    origin: "check_in",
  }));
  const result = compareMetric(entries, focus.id, focus.scale);
  assert.equal(result.done.average, 8);
  assert.equal(result.notDone.average, 5);
  assert.equal(result.difference, 3);
  assert.equal(result.conclusion, "higher");
  assert.equal(
    comparisonText(result, metricLabel(focus), t.analytics),
    t.analytics.higher("Focus"),
  );
});
test("a single scored observation renders a point and explanation without a trend path", () => {
  const entry = buildDailyEntry(
    experiment,
    { habitStatus: "done", values: { [focus.id]: 7 } },
    "one",
    TODAY,
    TODAY,
  );
  const html = renderToStaticMarkup(
    createElement(MetricChart, { experiment: { ...experiment, entries: [entry] } }),
  );
  assert.match(html, /<circle/);
  assert.doesNotMatch(html, /<path/);
  assert.ok(html.includes(t.experiments.singleObservation));
  const next = buildDailyEntry(
    experiment,
    { habitStatus: "not_done", values: { [focus.id]: 5 } },
    "two",
    "2026-10-15",
    "2026-10-15",
  );
  const multiple = renderToStaticMarkup(
    createElement(MetricChart, { experiment: { ...experiment, entries: [entry, next] } }),
  );
  assert.match(multiple, /<path/);
  assert.ok(!multiple.includes(t.experiments.singleObservation));
});
test("identical one-point metrics stay separate observations without a relationship claim", () => {
  const entry = buildDailyEntry(
    { ...experiment, metrics: [focus, builtInMetric("mood")] },
    { habitStatus: "done", values: { [focus.id]: 7, mood: 7 } },
    "one",
    TODAY,
    TODAY,
  );
  const html = renderToStaticMarkup(
    createElement(MetricChart, {
      experiment: { ...experiment, metrics: [focus, builtInMetric("mood")], entries: [entry] },
    }),
  );
  assert.equal((html.match(/<circle/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<path/);
  assert.equal(html.split(t.experiments.singleObservation).length - 1, 2);
});
test("version-three migration preserves scores, timestamps, IDs, and legacy archives", async () => {
  const storage = memoryStorage();
  const samples = [
    ...createSampleExperiments(TODAY),
    ...LEGACY_EXPERIMENTS.map((item) => adaptLegacyExperiment(item)),
  ];
  const previous = samples.map((item) => ({
    ...versionFourExperiment(item),
    metrics: item.metrics.map((metric) => metric.id),
  }));
  previous[0].entries[0].recordedAt = "2026-10-01T12:00:00.000Z";
  previous[0].entries[0].updatedAt = "2026-10-02T12:00:00.000Z";
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, experiments: previous }));
  const restored = await createLocalStorageRepository(storage).load();
  assert.ok(restored);
  for (const [i, item] of restored.entries()) {
    assert.deepEqual(item.entries, previous[i].entries);
    assert.deepEqual(item.legacy, previous[i].legacy);
    assert.deepEqual(
      item.metrics.map((metric) => metric.id),
      previous[i].metrics,
    );
    assert.ok(item.metrics.every((metric) => metric.kind === "built_in"));
  }
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}").version, 5);
  assert.deepEqual(await createLocalStorageRepository(storage).load(), restored);
});
test("unsupported scales are rejected until their product behavior is implemented", () => {
  assert.equal(
    metricDefinitionSchema.safeParse({ ...focus, scale: { kind: "boolean" } }).success,
    false,
  );
  assert.equal(
    metricDefinitionSchema.safeParse({
      ...focus,
      scale: { kind: "numeric", min: 0, max: 5, step: 1 },
    }).success,
    false,
  );
});

test("trend eligibility is counted per metric rather than by the number of check-ins", () => {
  const mixed = { ...experiment, metrics: [focus, builtInMetric("mood")] };
  const first = buildDailyEntry(
    mixed,
    { habitStatus: "done", values: { [focus.id]: 7, mood: 6 } },
    "first",
    TODAY,
    TODAY,
  );
  const second = buildDailyEntry(
    mixed,
    { habitStatus: "not_done", values: { mood: 5 } },
    "second",
    "2026-10-15",
    "2026-10-15",
  );
  const html = renderToStaticMarkup(
    createElement(MetricChart, { experiment: { ...mixed, entries: [first, second] } }),
  );
  assert.equal((html.match(/<path/g) ?? []).length, 1);
  assert.equal(html.split(t.experiments.singleObservation).length - 1, 1);
  assert.ok(html.includes(`Focus: ${t.experiments.singleObservation}`));
});

test("chart bridges gaps with faded segments without manufacturing scores or tooltips", () => {
  const rows = [0, 1, 4].map((offset, index) =>
    buildDailyEntry(
      experiment,
      { habitStatus: "done", values: { [focus.id]: index + 6 } },
      `gap-${index}`,
      `2026-10-${14 + offset}`,
      `2026-10-${14 + offset}`,
    ),
  );
  const copy = structuredClone(rows);
  const html = renderToStaticMarkup(
    createElement(MetricChart, { experiment: { ...experiment, entries: rows } }),
  );
  assert.equal((html.match(/<circle/g) ?? []).length, 3);
  assert.equal((html.match(/<title>/g) ?? []).length, 3);
  assert.match(html, /data-segment="solid"/);
  assert.match(html, /data-segment="faded"[^>]*stroke-width="1.8"[^>]*stroke-opacity="0.28"/);
  assert.doesNotMatch(html, /data-segment="dashed"/);
  assert.ok(html.includes(t.experiments.chartGaps));
  assert.deepEqual(rows, copy);
  const consecutive = renderToStaticMarkup(
    createElement(MetricChart, { experiment: { ...experiment, entries: rows.slice(0, 2) } }),
  );
  assert.doesNotMatch(consecutive, /data-segment="faded"/);
  assert.ok(!consecutive.includes(t.experiments.chartGaps));
});
