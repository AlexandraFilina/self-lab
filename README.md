# self lab — Habit Experiments

A personal laboratory for exploring how everyday habits relate to reported sleep, mood, energy, and productivity. Start with a question, record done and not-done days, and discover patterns in your own observations.

Built on the existing Next.js, React, TypeScript, Tailwind CSS, and adapted shadcn/ui interface. The application and documentation remain in English; the existing visual system is preserved.

## Run locally

Use Node.js 24 LTS, matching `.nvmrc`.

```bash
npm ci
npm run dev
```

Open [localhost:3000/dashboard](http://localhost:3000/dashboard). Development and production builds use Webpack and the standard Tailwind PostCSS adapter. System fonts do not require external downloads.

```bash
npm run build
npm start
```

## What works

- Start with a blank question on Dashboard when there are no user-owned experiments. Continue to the shared New Experiment form to describe a habit, select metrics, and choose an observation target. Existing users keep the regular Dashboard.
- Choose one of five optional idea presets, edit every field, or write your own question. Blank drafts have no preselected metrics; presets select metrics only after an explicit click. Ideas are inspiration, not scientific recommendations. A separate link opens the labelled sample.
- Create a daily habit experiment without generating automatic check-ins. Details offers “Start observing today” and the existing Check in CTA.
- Decide when to finish: reaching the target keeps the experiment Active and offers “Finish & view results” or “Keep observing”. An active Details header always includes a secondary Finish experiment action. Confirmation shows elapsed days, recorded observations, Done / Not done, and elapsed missing-day counts; Keep observing dismisses it without changes.
- Extend the target by 7, 14, or a custom positive number of days, retaining a timestamped target history and all observations. Reopen a completed experiment without creating a copy.
- Record **Done** or **Not done** for today or yesterday, optionally rate selected metrics, and add a note.
- Create entries only for today or yesterday within the experiment window. Edit older saved entries without creating a duplicate. Future dates are rejected. Observation dates and save/edit timestamps are stored separately.
- Keep experiments and check-ins after reload using a separate, versioned localStorage repository.
- Create another experiment with a fresh form. Failed saves keep the input and leave the previous saved snapshot unchanged.
- Read a separate “What you observed” result for each metric, with relative differences in reported scores, scored group sizes, descriptive data labels, and expandable calculation details.
- Review a completed daily sample with overlapping scores, missing days, and a collapsed observations table that preserves editing.
- Add experiment-local custom metrics with stable UUID-based IDs, required names up to 40 characters, case-insensitive duplicate checks, and removal before creation. Built-in labels come from the English dictionary; custom labels remain user content.
- Show a single scored observation as a point without a trend line. Connect adjacent recorded days with solid lines and cross missing-score days with labelled dashed bridges; no scores or tooltips are invented.
- Use a reusable keyboard-accessible metric slider with seven semantic descriptions on the unchanged numeric 1–10 scale. Unrated values remain missing.

Storage is local to this browser profile and site origin. There is no account or cross-device synchronization. The application labels local storage and fictional samples. Clearing site data also removes locally saved observations.

## Interpretation

A missing check-in is **not** a not-done day. Missing scores are excluded separately for each metric. At least five scored observations in each group are required to show a percentage. The relative difference is `(done average - not-done average) / not-done average * 100`, calculated from unrounded means and displayed as a whole percentage. Missing, non-finite, or non-positive not-done averages produce no percentage. This describes average reported scores, not a percentage improvement in wellbeing.

Absolute differences within half a scale point use the headline “No clear difference”; their relative difference remains secondary. Other relative differences below 10% are described as slightly higher or lower. Data labels use the smaller scored group: fewer than 5 is “Too early to compare”, 5–9 is “Early pattern”, and 10 or more is “Pattern worth noticing”. These are descriptive product rules, not statistical confidence or significance tests. Calculation details show means, scored counts, missing scores, missing days for completed experiments, and excluded observations when present.

Subjective scores, small or unbalanced samples, selection effects, workload, weekends, and other circumstances limit interpretation. The app does not claim causation or use an AI API for conclusions.

## Existing samples and migration

The original three A/B sample experiments remain intact in `legacy-experiments.ts`. An explicit adapter preserves their scores, dates, IDs, notes, hypotheses, and conditions. Habit completion was not recorded, so migrated observations are marked **Not recorded** and excluded from done/not-done comparisons. Their original conditions remain available in the compact “Legacy experiment details” disclosure.

One labelled fictional completed daily example demonstrates the comparison mode. The completed 28-day example has 13 done days, 8 not-done days, and 7 days without entries. Mood scores overlap between groups and show a higher reported average on done days; productivity has no clear difference. A sample-data cleanup replaces retired fictional examples identified by both stable IDs and `source: "sample"`. User-owned experiments are never removed, even with an old sample ID or title. Existing current-sample edits, empty workspaces, and user-only workspaces are preserved. Legacy fixtures remain available for compatibility tests, not seeded into the user workspace. These are not presented as the user's measurements. Supported version-one through version-four saved snapshots migrate to version five. Lifecycle is explicit: `status`, `completedAt`, and `targetExtensions`. Existing user experiments migrate to Active because no explicit finish decision was recorded; the known current completed sample migrates to Completed with an unknown (`null`) completion timestamp. Finishing now saves a real ISO timestamp; reopening clears it. Existing built-in metric IDs and score keys remain unchanged; metric ID arrays become definitions containing kind and numeric scale metadata. Older `date` fields become `observedDate`; unknown original save/edit timestamps remain `null`. New entries receive `recordedAt`; edits preserve that value and set `updatedAt`. Invalid or unsupported storage is reported and never silently replaced by samples.

## Architecture

```text
src/
  app/                              Existing routes and metadata
  components/                       Shared layout, UI, and storage boundary
  features/
    dashboard/                      Existing dashboard presentation
    experiments/
      components/                   Creation, check-in, slider, charts, and results
      context/                      Hydration, local clock, and serialized saves
      data/                         Repository, migration, and preserved samples
      model/                        Types, validation, actions, and pure analytics
  i18n/                             Typed English dictionary and locale
  lib/                              Calendar dates, formatting, and error mapping

tests/                              Domain, repository, and migration tests
  browser/                          Real Chrome regression scenario
```

Read [PRODUCT.md](docs/PRODUCT.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md), and [AGENTS.md](AGENTS.md) for product boundaries and project rules. Supabase can replace the asynchronous repository without putting storage calls in UI or analytics. Authentication, database access, Vercel, AI APIs, and statistical models are not implemented in this stage.

## Checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

For the real browser regression test, build first and install Chrome if it is not already available:

```bash
npm run build
npm run test:browser
```

The browser test uses real headless Chrome through Chrome DevTools Protocol and the existing Node test runner, without another test dependency. By default it starts a production server on port 3101 and uses a separate temporary browser profile. Set `SELF_LAB_CHROME_PATH` or `SELF_LAB_TEST_PORT` if needed.

To exercise development behavior, including React Strict Mode and Next.js instant-navigation validation, start `npm run dev` in another terminal and run:

```bash
SELF_LAB_TEST_BASE_URL=http://localhost:3000 npm run test:browser
```

With that variable set, the test connects to the existing server and does not start or stop it. Chrome always uses a separate temporary profile. The test starts with empty and sample-only onboarding, validates the question and metric requirement, creates a first experiment with built-in/custom metrics, reloads with zero automatic check-ins, bypasses onboarding for existing users, and edits an idea preset. It sends actual mouse events to visible, unobscured buttons; it checks empty metric selection, custom metric creation/removal/duplicates and persistence, clicks both Dashboard check-in entrypoints and the details entrypoint, confirms the modal stays open after effects settle, saves today/yesterday observations, edits without duplication, and reloads the document. It also creates observations, finishes early, checks Active/Completed filters and dashboard counts, reloads the completed state, reopens without losing entries, extends an expired target using presets and custom days, and verifies failed lifecycle writes. It covers completed per-metric results after reload, collapsed observation tables on reload and after returning through client navigation, editing a completed observation without duplication, safe removal of retired fictional samples, repeated creation, fresh forms, failed writes, missing scores, a local date that differs from UTC, midnight during an open check-in, mobile layout, Escape, and invalid storage recovery. Console/runtime errors fail the test. Desktop/mobile/dialog screenshots are written to the temporary profile path printed by the test.

The original production-only test did open the details check-in and verify saving/reload, but did not exercise Dashboard check-in buttons or the development Strict Mode lifecycle. It could therefore miss the immediate-close regression.

## CI installation diagnosis

The failed GitHub run stopped at `npm ci` with `EUSAGE`: the lockfile was missing `@emnapi/runtime@1.11.3` and `@emnapi/core@1.11.3`. npm 11.6.2 accepted the incomplete graph locally; npm 11.19.1 reproduced the exact failure. The corrected lockfile includes the missing optional peer and bundled entries without upgrading existing package versions.

The workflow still uses `npm ci` and retains formatting, lint, type, test, and build checks. Node is read from `.nvmrc`; runtime versions are printed for diagnosis. A local successful installation is not a claim that a new GitHub run has passed: that requires an authorized commit/push and a completed remote run.

## Manual browser review

1. In a separate browser profile, open Dashboard: enter a question, Continue, fill the name/habit, and select metrics. Try saving without metrics, then add a custom one and create. Details should offer Check in today with no automatic entries; reload and verify Dashboard now shows your experiment. Open New experiment, try an idea, edit its question/fields, and confirm subsequent blank forms are fresh.
2. Open Check in on Dashboard and in details, choose Today or Yesterday, record Done or Not done, rate only the metrics you can assess, and save. Yesterday is unavailable before the experiment start date.
3. Edit the same date, reload, and confirm one updated entry remains.
4. Check that a missing entry and a Not done entry produce different group counts.
5. Open Completed → “Morning walks, mood, and productivity”: inspect separate Mood (+24%) and Productivity (“No clear difference”) cards, then expand “How was this calculated?” to inspect counts, averages, missing scores, formula, and limitations. Expand “View 21 daily observations”, edit a saved row, reload, and verify it remains a single edited row while the table starts collapsed.
6. Verify All and Completed show one current fictional sample. Previously imported user-owned experiments retain their original scores and unclassified completion status.
7. Finish a new experiment early, confirm the summary, reload, and reopen it. Check that counts and entries survive. On an expired target, try Keep observing → +7 / +14 / Custom, inspect the new target preview, and reload.
8. Check narrow screens, keyboard sliders, radio controls, and closing the dialog with Escape.

Third-party attribution remains in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). No new dependencies were required for this stage.

Permanent deletion and archiving are roadmap items, not implemented. Extensions retain the existing maximum total target of 365 days; if the target has passed, added days start today. Early-finished results count only elapsed target days when reporting missing observations.
