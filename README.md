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

- Create a daily habit experiment with a question, one habit, an observation window, and selected metrics.
- Record **Done** or **Not done** for today or yesterday, optionally rate selected metrics, and add a note.
- Create entries only for today or yesterday within the experiment window. Edit older saved entries without creating a duplicate. Future dates are rejected. Observation dates and save/edit timestamps are stored separately.
- Keep experiments and check-ins after reload using a separate, versioned localStorage repository.
- Create another experiment with a fresh form. Failed saves keep the input and leave the previous saved snapshot unchanged.
- Compare actual saved done/not-done observations, with sample sizes, averages, point differences, deterministic summaries, and expandable calculation details.
- Use a reusable keyboard-accessible metric slider with seven semantic descriptions on the unchanged numeric 1–10 scale. Unrated values remain missing.

Storage is local to this browser profile and site origin. There is no account or cross-device synchronization. The application labels local storage and fictional samples. Clearing site data also removes locally saved observations.

## Interpretation

A missing check-in is **not** a not-done day. Missing scores are excluded separately for each metric. At least five scored observations in each group are required for a directional summary. This threshold is a descriptive product rule, not a significance test. Differences are expressed in scale points, not as a scientifically proven percentage improvement in mood.

Subjective scores, small or unbalanced samples, selection effects, workload, weekends, and other circumstances limit interpretation. The app does not claim causation or use an AI API for conclusions.

## Existing samples and migration

The original three A/B sample experiments remain intact in `legacy-experiments.ts`. An explicit adapter preserves their scores, dates, IDs, notes, hypotheses, and conditions. Habit completion was not recorded, so migrated observations are marked **Not recorded** and excluded from done/not-done comparisons. Their original conditions remain available in the details screen.

A separately labelled fictional daily example demonstrates the new comparison mode. It is not presented as the user's measurements. Supported version-one and version-two saved snapshots migrate to version three. Older `date` fields become `observedDate`; unknown original save/edit timestamps remain `null`. New entries receive `recordedAt`; edits preserve that value and set `updatedAt`. Invalid or unsupported storage is reported and never silently replaced by samples.

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

With that variable set, the test connects to the existing server and does not start or stop it. Chrome always uses a separate temporary profile. The test sends actual mouse events to visible, unobscured buttons; it clicks both Dashboard check-in entrypoints and the details entrypoint, confirms the modal stays open after effects settle, saves today/yesterday observations, edits without duplication, and reloads the document. It also covers repeated creation, fresh forms, failed writes, missing scores, a local date that differs from UTC, midnight during an open check-in, mobile layout, Escape, and invalid storage recovery. Console/runtime errors fail the test. Desktop/mobile/dialog screenshots are written to the temporary profile path printed by the test.

The original production-only test did open the details check-in and verify saving/reload, but did not exercise Dashboard check-in buttons or the development Strict Mode lifecycle. It could therefore miss the immediate-close regression.

## CI installation diagnosis

The failed GitHub run stopped at `npm ci` with `EUSAGE`: the lockfile was missing `@emnapi/runtime@1.11.3` and `@emnapi/core@1.11.3`. npm 11.6.2 accepted the incomplete graph locally; npm 11.19.1 reproduced the exact failure. The corrected lockfile includes the missing optional peer and bundled entries without upgrading existing package versions.

The workflow still uses `npm ci` and retains formatting, lint, type, test, and build checks. Node is read from `.nvmrc`; runtime versions are printed for diagnosis. A local successful installation is not a claim that a new GitHub run has passed: that requires an authorized commit/push and a completed remote run.

## Manual browser review

1. Create an experiment, return to New experiment, and verify the fields are fresh.
2. Open Check in on Dashboard and in details, choose Today or Yesterday, record Done or Not done, rate only the metrics you can assess, and save. Yesterday is unavailable before the experiment start date.
3. Edit the same date, reload, and confirm one updated entry remains.
4. Check that a missing entry and a Not done entry produce different group counts.
5. Expand “How was this calculated?” and inspect counts, averages, differences, and limitations.
6. Open an imported example and verify its original scores and unclassified completion status.
7. Check narrow screens, keyboard sliders, radio controls, and closing the dialog with Escape.

Third-party attribution remains in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). No new dependencies were required for this stage.
