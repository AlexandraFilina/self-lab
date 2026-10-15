import assert from "node:assert/strict";
import { test } from "node:test";
import { t } from "../src/i18n";
import { EXPERIMENT_IDEAS } from "../src/features/experiments/data/experiment-ideas";
import { createSampleExperiments } from "../src/features/experiments/data/mock-experiments";
import {
  createEmptyExperimentDraft,
  createIdeaDraft,
  needsOnboarding,
} from "../src/features/experiments/model/onboarding";
import { buildCustomMetric, buildExperiment } from "../src/features/experiments/model/actions";
import { builtInMetric } from "../src/features/experiments/model/metrics";
import {
  experimentQuestionSchema,
  newExperimentSchema,
} from "../src/features/experiments/model/schemas";
import { applyLifecycle } from "../src/features/experiments/model/lifecycle";
import { createLocalStorageRepository } from "../src/features/experiments/data/local-storage-repository";

const TODAY = "2026-10-15";
const manualDraft = {
  title: "Reading and focus",
  question: "How do I rate focus on days when I read?",
  habit: "Read before work",
  durationDays: 21,
  metrics: [builtInMetric("mood")],
};

test("empty and sample-only workspaces need onboarding rather than the regular dashboard", () => {
  assert.equal(needsOnboarding([]), true);
  assert.equal(needsOnboarding(createSampleExperiments(TODAY)), true);
});
test("any user experiment bypasses onboarding regardless of lifecycle or sample-like title and ID", () => {
  const user = buildExperiment(manualDraft, "morning-walk-completed", TODAY);
  assert.equal(needsOnboarding([user]), false);
  const completed = applyLifecycle(user, {
    type: "finish",
    completedAt: "2026-10-15T12:00:00.000Z",
  });
  assert.equal(needsOnboarding([completed]), false);
  assert.equal(
    needsOnboarding([...createSampleExperiments(TODAY), { ...completed, id: "user-copy" }]),
    false,
  );
});
test("a blank question-first draft has no example text or preselected metrics", () => {
  const draft = createEmptyExperimentDraft();
  assert.equal(draft.question, "");
  assert.equal(draft.title, "");
  assert.equal(draft.habit, "");
  assert.deepEqual(draft.metrics, []);
  assert.equal(draft.durationDays, 14);
});
test("the question step requires a trimmed, bounded question using the shared domain schema", () => {
  for (const question of ["", "   ", "x".repeat(601)])
    assert.equal(experimentQuestionSchema.safeParse(question).success, false);
  const missing = experimentQuestionSchema.safeParse(" ");
  assert.equal(missing.success, false);
  if (!missing.success)
    assert.equal(missing.error.issues[0].message, t.validation.required(t.form.question));
  assert.equal(experimentQuestionSchema.parse("  How do I feel?  "), "How do I feel?");
  assert.equal(newExperimentSchema.safeParse({ ...manualDraft, question: "" }).success, false);
});
test("manual onboarding cannot create an experiment without explicit metric selection", () => {
  const result = newExperimentSchema.safeParse({ ...manualDraft, metrics: [] });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.issues[0].message, t.validation.metric);
});
test("all five idea presets provide valid editable drafts and never manufacture observations", () => {
  assert.equal(EXPERIMENT_IDEAS.length, 5);
  assert.equal(new Set(EXPERIMENT_IDEAS.map((idea) => idea.id)).size, 5);
  for (const idea of EXPERIMENT_IDEAS) {
    const draft = createIdeaDraft(idea);
    assert.ok(newExperimentSchema.safeParse(draft).success);
    assert.deepEqual(
      draft.metrics.map((metric) => metric.id),
      idea.metricIds,
    );
    const experiment = buildExperiment(draft, `idea-${idea.id}`, TODAY);
    assert.equal(experiment.source, "user");
    assert.equal(experiment.status, "active");
    assert.deepEqual(experiment.entries, []);
  }
});
test("prefilled title, question, habit, metrics, and target can all be changed without mutating the idea", () => {
  const idea = EXPERIMENT_IDEAS[1];
  const original = structuredClone(idea);
  const draft = createIdeaDraft(idea);
  const edited = {
    ...draft,
    title: "My own question",
    question: "How does decaf relate to my sleep?",
    habit: "Choose decaf after lunch",
    durationDays: 28,
    metrics: [builtInMetric("energy")],
  };
  const experiment = buildExperiment(edited, "edited-idea", TODAY);
  assert.equal(experiment.question, edited.question);
  assert.equal(experiment.habit, edited.habit);
  assert.equal(experiment.durationDays, 28);
  assert.deepEqual(experiment.metrics, edited.metrics);
  assert.deepEqual(idea, original);
});
test("onboarding built-in and custom metrics persist with an active experiment and zero automatic check-ins", async () => {
  const custom = buildCustomMetric("Restfulness", "00000000-0000-4000-8000-000000000077");
  const draft = { ...manualDraft, metrics: [builtInMetric("sleep"), custom] };
  const experiment = buildExperiment(draft, "first-user-experiment", TODAY);
  let raw: string | null = null;
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
  const repository = createLocalStorageRepository(storage);
  await repository.load();
  await repository.save([...createSampleExperiments(TODAY), experiment]);
  const reloaded = await createLocalStorageRepository(storage).load();
  assert.ok(reloaded);
  const saved = reloaded.find((item) => item.id === experiment.id);
  assert.deepEqual(saved, experiment);
  assert.equal(saved?.status, "active");
  assert.deepEqual(saved?.entries, []);
  assert.equal(needsOnboarding(reloaded), false);
});
test("fresh drafts do not share metric selections or inherit a previously selected idea", () => {
  const first = createEmptyExperimentDraft();
  first.metrics.push(builtInMetric("mood"));
  assert.deepEqual(createEmptyExperimentDraft().metrics, []);
  const ideaDraft = createIdeaDraft(EXPERIMENT_IDEAS[0]);
  ideaDraft.metrics.length = 0;
  assert.deepEqual(
    createIdeaDraft(EXPERIMENT_IDEAS[0]).metrics.map((metric) => metric.id),
    ["mood"],
  );
  assert.equal(createEmptyExperimentDraft().question, "");
});
