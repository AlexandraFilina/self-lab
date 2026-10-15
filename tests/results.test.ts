import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  calculateRelativeDifference,
  compareMetric,
  getDataStrength,
  getProgress,
  getResultDirection,
  getResultsEnding,
  groupObservations,
} from "../src/features/experiments/model/analytics";
import { buildCustomMetric } from "../src/features/experiments/model/actions";
import { builtInMetric } from "../src/features/experiments/model/metrics";
import {
  createCompletedSampleExperiment,
  createSampleExperiments,
  ensureCompletedSample,
  COMPLETED_SAMPLE_ID,
} from "../src/features/experiments/data/mock-experiments";
import { adaptLegacyExperiment } from "../src/features/experiments/data/migration";
import { LEGACY_EXPERIMENTS } from "../src/features/experiments/data/legacy-experiments";
import { createLocalStorageRepository } from "../src/features/experiments/data/local-storage-repository";
import { experimentSchema } from "../src/features/experiments/model/schemas";
import { ResultsComparison } from "../src/features/experiments/components/results-comparison";
import { DailyObservations } from "../src/features/experiments/components/daily-observations";
import { ExperimentsProvider } from "../src/features/experiments/context/experiments-provider";
import { formatRelativePercent } from "../src/lib/format";
import type { DailyEntry, MetricId } from "../src/features/experiments/model/types";
import { t } from "../src/i18n";

const TODAY = "2026-10-15";
function observations(
  done: (number | undefined)[],
  notDone: (number | undefined)[],
  metric: MetricId = "mood",
): DailyEntry[] {
  return [
    ...done.map((value) => ({ value, status: "done" as const })),
    ...notDone.map((value) => ({ value, status: "not_done" as const })),
  ].map((item, index) => ({
    id: `row-${index}`,
    observedDate: `2026-09-${String(index + 1).padStart(2, "0")}`,
    recordedAt: null,
    updatedAt: null,
    habitStatus: item.status,
    values: item.value === undefined ? {} : { [metric]: item.value },
    note: "",
    origin: "check_in",
  }));
}
function resultMarkup(entries: DailyEntry[]) {
  const experiment = {
    ...createCompletedSampleExperiment(TODAY),
    metrics: [builtInMetric("mood")],
    entries,
  };
  return renderToStaticMarkup(createElement(ResultsComparison, { experiment, completed: true }));
}

test("relative difference follows the positive and negative average-score formula", () => {
  assert.equal(calculateRelativeDifference(7.5, 6), 25);
  assert.equal(calculateRelativeDifference(6, 7.5), -20);
  assert.equal(calculateRelativeDifference(6, 6), 0);
  assert.equal(calculateRelativeDifference(0, 5), -100);
});
test("relative difference rejects zero or meaningless denominators and non-finite inputs", () => {
  for (const denominator of [0, -1, NaN, Infinity, -Infinity, null])
    assert.equal(calculateRelativeDifference(7, denominator), null);
  for (const average of [NaN, Infinity, -Infinity, -1, null])
    assert.equal(calculateRelativeDifference(average, 6), null);
  assert.equal(calculateRelativeDifference(Number.MAX_VALUE, Number.MIN_VALUE), null);
});
test("relative percentages use stable whole-percent rounding without negative zero", () => {
  assert.equal(formatRelativePercent(25), "+25%");
  assert.equal(formatRelativePercent(-14.5), "-15%");
  assert.equal(formatRelativePercent(24.49), "+24%");
  assert.equal(formatRelativePercent(24.5), "+25%");
  assert.equal(formatRelativePercent(-0.4), "0%");
  assert.equal(formatRelativePercent(0), "0%");
  assert.equal(formatRelativePercent(25, false), "25%");
});
test("insufficient per-metric observations suppress percentages and retain honest counts", () => {
  const entries = observations([8, 8, 8], [6, 6, 6, 6, 6, 6, 6]);
  const result = compareMetric(entries, "mood");
  assert.equal(result.relativeDifference, null);
  assert.equal(result.strength, "too_early");
  assert.equal(result.done.count, 3);
  assert.equal(result.notDone.count, 7);
  const html = resultMarkup(entries);
  assert.ok(html.includes(t.analytics.insufficient));
  assert.ok(html.includes("3 done days · 7 not-done days"));
  assert.doesNotMatch(html, /class="result-percentage"/);
  assert.ok(html.includes(t.analytics.endings.insufficient));
});
test("missing scores reduce the scored group and are reported separately", () => {
  const result = compareMetric(
    observations([8, 8, 8, 8, undefined], [6, 6, 6, 6, 6, undefined]),
    "mood",
  );
  assert.equal(result.enough, false);
  assert.equal(result.relativeDifference, null);
  assert.deepEqual(result.missingScores, { done: 1, notDone: 1 });
  assert.equal(result.done.average, 8);
  assert.equal(result.notDone.average, 6);
});
test("equal and small differences have a neutral result rather than a positive headline", () => {
  const equal = compareMetric(observations([6, 6, 6, 6, 6], [6, 6, 6, 6, 6]), "mood");
  assert.equal(equal.relativeDifference, 0);
  assert.equal(getResultDirection(equal), "similar");
  assert.equal(getResultsEnding([equal]), "similar");
  const entries = observations([6, 6, 6, 7, 6], [6, 6, 6, 6, 6]);
  const html = resultMarkup(entries);
  assert.ok(html.includes(t.analytics.noClearDifference));
  assert.doesNotMatch(html, /class="result-percentage"/);
  assert.ok(html.includes(t.analytics.endings.similar));
});
test("directional rules preserve negative scores and describe small directional differences calmly", () => {
  const slightly = compareMetric(observations([9, 9, 9, 9, 9], [8, 8, 8, 9, 8]), "mood");
  assert.equal(getResultDirection(slightly), "slightly_higher");
  const lower = compareMetric(observations([5, 5, 5, 5, 5], [7, 7, 7, 7, 7]), "mood");
  assert.equal(getResultDirection(lower), "lower");
  assert.ok(lower.relativeDifference !== null && lower.relativeDifference < 0);
});
test("data strength uses the smaller scored group without claiming statistical confidence", () => {
  for (const [done, notDone, expected] of [
    [4, 20, "too_early"],
    [20, 4, "too_early"],
    [5, 20, "early_pattern"],
    [20, 9, "early_pattern"],
    [10, 10, "worth_noticing"],
    [30, 10, "worth_noticing"],
  ] as const)
    assert.equal(getDataStrength(done, notDone), expected);
  assert.equal(getDataStrength(NaN, 10), "too_early");
  assert.equal(t.analytics.strength.early_pattern, "Early pattern");
  assert.equal(t.analytics.strength.worth_noticing, "Pattern worth noticing");
});
test("custom metrics get independent relative results and preserve their display labels", () => {
  const custom = buildCustomMetric("Stress", "00000000-0000-4000-8000-000000000099");
  const entries = observations([5, 5, 5, 5, 5], [7, 7, 7, 7, 7], custom.id);
  const experiment = { ...createCompletedSampleExperiment(TODAY), metrics: [custom], entries };
  const result = compareMetric(entries, custom.id, custom.scale);
  assert.equal(result.conclusion, "lower");
  const html = renderToStaticMarkup(
    createElement(ResultsComparison, { experiment, completed: true }),
  );
  assert.ok(html.includes("Stress"));
  assert.ok(html.includes("-29%"));
  assert.ok(html.includes("Average reported Stress score was 29% lower on done days."));
  assert.doesNotMatch(html, /improved|increased your|This proves/);
});
test("the completed demo contains overlapping done/not-done scores and genuinely missing days", () => {
  const experiment = createCompletedSampleExperiment(TODAY);
  assert.ok(experimentSchema.safeParse(experiment).success);
  assert.equal(getProgress(experiment, TODAY).completed, true);
  assert.equal(experiment.source, "sample");
  const groups = groupObservations(experiment.entries);
  assert.equal(groups.done.length, 13);
  assert.equal(groups.notDone.length, 8);
  assert.equal(groups.unclassified.length, 0);
  assert.equal(experiment.durationDays - experiment.entries.length, 7);
  const doneValues = groups.done.map((entry) => entry.values.mood);
  assert.ok(groups.notDone.some((entry) => doneValues.includes(entry.values.mood)));
  assert.equal(compareMetric(experiment.entries, "mood").conclusion, "higher");
  assert.equal(compareMetric(experiment.entries, "productivity").conclusion, "similar");
  assert.ok(experiment.entries.every((entry) => entry.observedDate < TODAY));
});
test("legacy unclassified observations remain excluded from every result", () => {
  const legacy = adaptLegacyExperiment(LEGACY_EXPERIMENTS[2]);
  const result = compareMetric(legacy.entries, "mood");
  assert.equal(result.done.count, 0);
  assert.equal(result.notDone.count, 0);
  assert.equal(result.excluded, 20);
  assert.equal(result.relativeDifference, null);
});
test("completed observations use a closed native disclosure by default while active tables stay open", () => {
  const experiment = createCompletedSampleExperiment(TODAY);
  const render = (completed: boolean) =>
    renderToStaticMarkup(
      createElement(
        ExperimentsProvider,
        null,
        createElement(DailyObservations, { experiment, completed }),
      ),
    );
  const html = render(true);
  assert.match(html, /<details class="observations-disclosure">/);
  assert.doesNotMatch(html, /<details[^>]*\bopen(?:=|\s|>)/);
  assert.ok(html.includes("View 21 daily observations"));
  assert.ok(html.includes('class="entries-table"'));
  assert.ok(!render(false).includes('class="observations-disclosure"'));
});
test("known sample cleanup replaces retired demos and never removes user experiments", () => {
  const legacy = LEGACY_EXPERIMENTS.map((item) => adaptLegacyExperiment(item));
  const user = { ...legacy[2], source: "user" as const };
  const sameTitle = { ...user, id: "user-copy", title: legacy[2].title };
  const unknownSample = { ...legacy[0], id: "unknown-sample" };
  const previous = [...legacy.slice(0, 2), user, sameTitle, unknownSample];
  const copy = structuredClone(previous);
  const updated = ensureCompletedSample(previous, TODAY);
  assert.deepEqual(previous, copy);
  assert.ok(updated.includes(user));
  assert.ok(updated.includes(sameTitle));
  assert.ok(updated.includes(unknownSample));
  assert.equal(
    updated.filter((item) => item.source === "sample" && item.id === COMPLETED_SAMPLE_ID).length,
    1,
  );
  assert.equal(
    updated.some((item) => item.source === "sample" && item.id === "morning-walk"),
    false,
  );
  assert.equal(ensureCompletedSample(updated, TODAY), updated);
  const edited = updated.map((item) =>
    item.id === COMPLETED_SAMPLE_ID ? { ...item, title: "Edited sample" } : item,
  );
  assert.equal(ensureCompletedSample(edited, TODAY), edited);
  assert.equal(ensureCompletedSample([user], TODAY)[0], user);
  const empty: typeof previous = [];
  assert.equal(ensureCompletedSample(empty, TODAY), empty);
  assert.deepEqual(
    createSampleExperiments(TODAY).map((item) => item.id),
    [COMPLETED_SAMPLE_ID],
  );
});
test("completed results and calculation inputs remain identical after repository reload", async () => {
  let raw: string | null = null;
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
  const repository = createLocalStorageRepository(storage);
  await repository.load();
  const experiment = createCompletedSampleExperiment(TODAY);
  await repository.save([experiment]);
  const reloaded = await createLocalStorageRepository(storage).load();
  assert.ok(reloaded);
  const before = renderToStaticMarkup(
    createElement(ResultsComparison, { experiment, completed: true }),
  );
  const after = renderToStaticMarkup(
    createElement(ResultsComparison, { experiment: reloaded[0], completed: true }),
  );
  assert.equal(after, before);
  assert.ok(after.includes("+24%"));
  assert.ok(after.includes(t.analytics.causalLimit));
});
