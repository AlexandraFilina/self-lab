import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildDailyEntry, buildExperiment } from "../src/features/experiments/model/actions";
import { builtInMetric } from "../src/features/experiments/model/metrics";
import { DEFAULT_NUMERIC_SCALE } from "../src/features/experiments/model/types";
import type { DailyReflection, GlobalMetric } from "../src/features/reflections/model/types";
import {
  availableTrendMetrics,
  trendActivity,
  trendSeries,
  trendWindow,
} from "../src/features/dashboard/model/dashboard-trends";
import { DashboardTrendVisual } from "../src/features/dashboard/components/dashboard-trends";

const today = "2026-10-22";
const custom = {
  id: "custom_00000000-0000-4000-8000-000000000001" as const,
  kind: "custom" as const,
  label: "Restfulness",
  scale: DEFAULT_NUMERIC_SCALE,
};
const metrics: GlobalMetric[] = [
  { definition: builtInMetric("mood"), active: true },
  { definition: builtInMetric("energy"), active: false },
  { definition: custom, active: true },
  {
    definition: { ...custom, id: "custom_00000000-0000-4000-8000-000000000002" },
    active: false,
  },
];
function reflection(date: string, values: DailyReflection["values"]): DailyReflection {
  return {
    id: date,
    observedDate: date,
    values,
    note: "",
    recordedAt: `${date}T12:00:00.000Z`,
    updatedAt: null,
  };
}

test("dashboard trend reads only global DailyReflection values and switches selected metrics", () => {
  const available = availableTrendMetrics(metrics);
  assert.deepEqual(
    available.map((metric) => metric.id),
    ["mood", "energy", custom.id],
  );
  const reflections = [
    reflection("2026-10-20", { mood: 8, energy: 3, [custom.id]: 6 }),
    reflection("2026-10-21", { energy: 7, [custom.id]: 9 }),
  ];
  const window = trendWindow(reflections, today, 7, 0);
  assert.deepEqual(trendSeries(reflections, available[0], window).points, [
    { date: "2026-10-20", value: 8 },
  ]);
  assert.deepEqual(
    trendSeries(reflections, available[1], window).points.map((point) => point.value),
    [3, 7],
  );
  assert.deepEqual(
    trendSeries(reflections, available[2], window).points.map((point) => point.value),
    [6, 9],
  );
});

test("missing scores remain gaps and one observation has no line", () => {
  const mood = builtInMetric("mood");
  const reflections = [
    reflection("2026-10-18", { mood: 3 }),
    reflection("2026-10-19", { energy: 6 }),
    reflection("2026-10-20", { mood: 8 }),
  ];
  const window = trendWindow(reflections, today, 7, 0);
  const series = trendSeries(reflections, mood, window);
  assert.deepEqual(
    series.points.map((point) => point.date),
    ["2026-10-18", "2026-10-20"],
  );
  assert.equal(series.segments.length, 1);
  assert.equal(series.segments[0].kind, "faded");
  assert.deepEqual(trendSeries([reflections[0]], mood, window).segments, []);
  assert.deepEqual(trendSeries([reflections[1]], mood, window).points, []);
});

test("7, 14, 30, and All windows navigate without extending beyond today", () => {
  const reflections = [reflection("2026-09-01", { mood: 5 })];
  for (const [range, start] of [
    [7, "2026-10-16"],
    [14, "2026-10-09"],
    [30, "2026-09-23"],
  ] as const) {
    const current = trendWindow(reflections, today, range, 0);
    assert.equal(current.start, start);
    assert.equal(current.end, today);
    assert.equal(current.canNext, false);
    assert.equal(current.canPrevious, true);
    const previous = trendWindow(reflections, today, range, 1);
    assert.equal(previous.canNext, true);
    assert.ok(previous.end < current.start);
  }
  const all = trendWindow(reflections, today, "all", 0);
  assert.deepEqual(all, {
    start: "2026-09-01",
    end: today,
    canPrevious: false,
    canNext: false,
  });
  assert.equal(trendWindow(reflections, today, 7, 8).canPrevious, false);
  assert.deepEqual(trendWindow([], today, "all", 0), {
    start: today,
    end: today,
    canPrevious: false,
    canNext: false,
  });
});

test("activity markers use one selected user experiment and preserve Done and Not done", () => {
  const first = buildExperiment(
    {
      title: "Walking",
      question: "How do walks relate to mood?",
      habit: "Walk",
      durationDays: 14,
      metrics: [builtInMetric("mood")],
    },
    "first",
    "2026-10-15",
  );
  first.entries = [
    buildDailyEntry(
      first,
      { habitStatus: "done", values: { mood: 9 } },
      "one",
      "2026-10-19",
      "2026-10-19",
    ),
    buildDailyEntry(
      first,
      { habitStatus: "not_done", values: {} },
      "two",
      "2026-10-20",
      "2026-10-20",
    ),
  ];
  const second = { ...first, id: "second", title: "Reading" };
  second.entries = [
    buildDailyEntry(
      second,
      { habitStatus: "done", values: {} },
      "three",
      "2026-10-20",
      "2026-10-20",
    ),
  ];
  const window = trendWindow([], today, 7, 0);
  assert.deepEqual(
    trendActivity([first, second], "first", window).map(({ title, status, date }) => ({
      title,
      status,
      date,
    })),
    [
      { title: "Walking", status: "done", date: "2026-10-19" },
      { title: "Walking", status: "not_done", date: "2026-10-20" },
    ],
  );
  assert.equal(trendActivity([first, second], "second", window).length, 1);
  assert.deepEqual(trendActivity([first, second], null, window), []);
  assert.deepEqual(trendActivity([{ ...first, source: "sample" }], "first", window), []);
});

test("a metric without scores renders only its named empty state, even with habit activity", () => {
  const window = trendWindow([], today, 7, 0);
  const html = renderToStaticMarkup(
    createElement(DashboardTrendVisual, {
      metric: builtInMetric("focus"),
      series: trendSeries(
        [reflection("2026-10-20", { energy: 8 })],
        builtInMetric("focus"),
        window,
      ),
      window,
      experimentTitle: "Morning walk",
      activity: [
        {
          date: "2026-10-20",
          experimentId: "walk",
          title: "Morning walk",
          status: "done" as const,
          day: 4,
        },
      ],
    }),
  );
  assert.match(html, /No Focus observations yet\./);
  assert.doesNotMatch(html, /<svg|dashboard-trend-activity-point|dashboard-trends-habit-strip/);
});

test("one recorded score is one focusable point; None hides the habit strip", () => {
  const window = trendWindow([], today, 7, 0);
  const metric = builtInMetric("mood");
  const html = renderToStaticMarkup(
    createElement(DashboardTrendVisual, {
      metric,
      series: trendSeries([reflection("2026-10-20", { mood: 7 })], metric, window),
      window,
      activity: [],
      experimentTitle: null,
    }),
  );
  assert.equal((html.match(/class="dashboard-trend-point"/g) ?? []).length, 1);
  assert.match(html, /class="dashboard-trend-point"[^>]*tabindex="0"/);
  assert.doesNotMatch(html, /<path|dashboard-trends-habit-strip/);
  assert.match(html, /One daily observation in this window\./);
});

test("custom score gaps fade without fake points, and habit markers live in a separate strip", () => {
  const window = trendWindow([], today, 7, 0);
  const series = trendSeries(
    [reflection("2026-10-18", { [custom.id]: 4 }), reflection("2026-10-20", { [custom.id]: 8 })],
    custom,
    window,
  );
  const html = renderToStaticMarkup(
    createElement(DashboardTrendVisual, {
      metric: custom,
      series,
      window,
      experimentTitle: "Morning walk",
      activity: [
        {
          date: "2026-10-20",
          experimentId: "walk",
          title: "Morning walk",
          status: "not_done" as const,
          day: 4,
        },
      ],
    }),
  );
  assert.equal((html.match(/class="dashboard-trend-point"/g) ?? []).length, 2);
  assert.match(html, /data-segment="faded"[^>]*stroke-width="1.8"[^>]*stroke-opacity="0.28"/);
  assert.doesNotMatch(html, /data-segment="dashed"|stroke-dasharray="4 5"/);
  assert.match(html, /Faded lines cross days without a recorded score\./);
  assert.ok(html.indexOf("dashboard-trend-activity-point") > html.indexOf("</svg>"));
  assert.match(html, /Morning walk — Not done — October 20/);
  assert.match(html, /data-date="2026-10-18"/);
  assert.doesNotMatch(html, /data-date="2026-10-19"/);
});
