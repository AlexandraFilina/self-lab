import assert from "node:assert/strict";
import { test } from "node:test";
import { buildChartSegments } from "../src/features/experiments/model/chart-segments";

const observations = [
  { date: "2026-10-01", value: 7 },
  { date: "2026-10-02", value: 8 },
  { date: "2026-10-04", value: 6 },
  { date: "2026-10-05", value: 7 },
  { date: "2026-10-09", value: 5 },
];
test("chart segments are solid only between adjacent calendar dates", () => {
  assert.deepEqual(
    buildChartSegments(observations).map((segment) => segment.kind),
    ["solid", "dashed", "solid", "dashed"],
  );
});
test("every bridge connects two actual observations without creating points or values", () => {
  const before = structuredClone(observations);
  const segments = buildChartSegments(observations);
  assert.equal(segments.length, observations.length - 1);
  for (const [index, segment] of segments.entries()) {
    assert.equal(segment.from, observations[index]);
    assert.equal(segment.to, observations[index + 1]);
  }
  assert.deepEqual(observations, before);
});
test("zero or one observation produces no line of either style", () => {
  assert.deepEqual(buildChartSegments([]), []);
  assert.deepEqual(buildChartSegments(observations.slice(0, 1)), []);
});
test("calendar adjacency is stable across month, year, and daylight-saving boundaries", () => {
  for (const [from, to] of [
    ["2026-01-31", "2026-02-01"],
    ["2026-12-31", "2027-01-01"],
    ["2026-10-25", "2026-10-26"],
    ["2026-03-29", "2026-03-30"],
  ]) {
    assert.equal(
      buildChartSegments([
        { date: from, value: 6 },
        { date: to, value: 6 },
      ])[0].kind,
      "solid",
    );
  }
});
test("chart segmentation is independent of metric labels, IDs, and score direction", () => {
  const increasing = observations.map((item, index) => ({ ...item, value: index + 1 }));
  const decreasing = observations.map((item, index) => ({ ...item, value: 10 - index }));
  assert.deepEqual(
    buildChartSegments(increasing).map((item) => item.kind),
    buildChartSegments(decreasing).map((item) => item.kind),
  );
});
test("unsorted or duplicate dates cannot silently produce misleading solid lines", () => {
  assert.throws(() => buildChartSegments([...observations].reverse()));
  assert.throws(() => buildChartSegments([observations[0], observations[0]]));
});
