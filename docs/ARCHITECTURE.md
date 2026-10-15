# Architecture

The existing Next.js App Router application keeps its visual system and feature-based structure.

- `src/app`: route entrypoints and metadata. Routes compose features rather than implementing domain rules.
- `src/components`: shared layout, UI primitives, icons, and local storage loading/error presentation.
- `src/features/experiments/model`: types, Zod validation, date rules, immutable actions, and pure descriptive analytics.
- `src/features/experiments/data`: preserved legacy fixtures, explicit migration, sample creation, and the repository contract and localStorage adapter.
- `src/features/experiments/context`: hydration, current local date, serialized persistence, and typed UI actions.
- `src/features/experiments/components`: creation, check-in, metric selection, saved entries, and comparison presentation.
- `src/features/dashboard`: the existing dashboard presentation using the same experiment source.
- `src/i18n`: one real English dictionary, typed access, and locale-aware formatting. No language switcher or fictional translations.
- `tests`: Node test runner with tsx; domain, migration, repository, and critical flow coverage.

## Domain and migration

The implemented mode is `daily_habit`. A discriminant provides a boundary for future modes without implementing unused A/B behavior. An experiment has a question, habit, duration, selected metrics, and dated observations.

New observations require an explicit `done` or `not_done` status. Optional metric values are absent until selected. Legacy A/B entries retain their original scores, IDs, notes, dates, and conditions. Their habit status is unknown, so they are visible but excluded from done/not-done comparisons. The full legacy source is retained for traceability.

`observedDate` is a date-only calendar string. New check-ins can be created only for today or yesterday within the observation window. Earlier saved entries can still be edited. `recordedAt` is the first successful save instant; `updatedAt` starts as null and changes on edit. Save/edit instants use ISO UTC timestamps; the observation day uses local calendar semantics. Version-four migration preserves version-one, version-two, and version-three observations without fabricating unknown timestamps. Existing built-in IDs remain unchanged when metric arrays are converted to definitions.

Date-only strings represent calendar dates. The current date is obtained from local browser date parts, not a UTC slice. Analytics use supplied data and dates without reading storage or a hidden clock.

## Metric definitions

Each experiment owns its metric definitions. A definition distinguishes `built_in` from `custom`, has a stable ID, and includes numeric scale metadata (`kind`, `min`, `max`, `step`). Built-in IDs remain sleep/mood/productivity/energy and resolve display labels through i18n. Custom IDs are `custom_` followed by a UUID; their trimmed labels are user content, limited to 40 characters. Labels never serve as score keys. Duplicate selected names are rejected case-insensitively, including built-in labels and IDs.

All currently accepted scales are numeric 1–10 with step 1. Sliders, validation, charts, and analytics consume scale metadata, while unsupported scale variants are rejected. Boolean, duration, count, alternative ranges, and a global custom metric library are not implemented.

Analytics receive a metric ID and numeric scale separately from the display label. Chart series with one scored observation contain a point, no line, and a localized explanation. Consecutive recorded days connect with solid paths; missing-score calendar days are crossed with dashed bridges and a dictionary explanation. Circles and tooltips exist only for actual recorded scores. Coincident scores do not imply a relationship between metrics.

## Results presentation

`compareMetric` groups saved observations by explicit habit status and summarizes valid scores separately for each metric ID. It exposes averages, counts, absolute difference, relative difference, missing-score counts, excluded observations, conclusion, and data-strength label. `calculateRelativeDifference` validates finite averages and a positive denominator; percentages remain unavailable until both scored groups have at least five observations. `formatRelativePercent` formats whole percentages without negative zero.

The existing half-point similarity rule suppresses directional headlines for small absolute differences. `getResultDirection` describes other relative differences below 10% as slight. `getDataStrength` uses the smaller scored group with boundaries 5 and 10; these are descriptive counts, not confidence. No scores are pooled across metrics. `getResultsEnding` selects only supportive dictionary copy from the independent metric results.

`ResultsComparison` renders per-metric cards and an expandable calculation table in its existing layout slot. The chart retains its position. `DailyObservations` wraps the existing editable table in a closed native disclosure for completed experiments; active tables remain expanded. Legacy conditions use a separate compact native disclosure. All system copy comes from i18n, while custom names remain user content.

## Persistence boundary

UI actions validate domain input, build the next snapshot, persist it through `ExperimentsRepository`, and only then expose success. A failed write leaves the previous state and the form input intact. The provider serializes writes to avoid racing saves. The local adapter validates versioned snapshots and enforces unique experiment IDs and experiment/date pairs. It migrates supported old snapshots and reports corrupt or unsupported data rather than replacing it.

The provider hydrates after mounting, keeping server and first client render consistent. Data-dependent screens show loading until storage has been read. The loading/error boundary is inside each route, never around the root layout’s route children. This keeps the page segment in the server render tree so Next.js can validate instant navigation. Existing stored data take priority over fictional seed examples. During hydration, `ensureCompletedSample` removes only retired fictional samples identified by stable IDs and `source: "sample"`, retaining all user-owned experiments and unknown IDs. It ensures a replacement completed sample when retiring examples, preserves edits to the current sample, skips empty/user-only workspaces, and saves through the same repository. Fresh workspaces contain one completed daily sample; legacy fixtures are used only for compatibility tests. No schema change is needed for this idempotent content migration. Storage errors expose an explicit retry path.

## Form lifecycle

Next.js preserves inactive routes with React Activity. The creation form uses uncontrolled built-in fields and a stable callback-ref cleanup to reset both the native form and custom metric React state when its route is hidden, as well as after a successful creation. Cleanup resets React state directly because the native reset event alone is not reliable while Activity detaches event handling. Validation and storage errors do not detach that ref, so input survives a failed submission. Browser tests use visible elements to avoid interacting with an inactive preserved route.

## Native dialog lifecycle

Check-in uses the existing native modal. Development Strict Mode replays effect setup/cleanup: showing, closing, and showing the dialog can queue a close event while it is open again. The close handler dismisses only if the dialog is currently closed. This preserves real Escape/close behavior without dismissing a reopened dialog. Selecting an observation day mounts the form for that date and loads only that date’s existing values.

## Future Supabase integration

Replace the repository implementation with real asynchronous Supabase reads and writes. Retain pure validation and analytics, while adding server-side validation, user IDs, authenticated ownership, row-level security, and database uniqueness on `(experiment_id, date)`. Revisit synchronization and conflict handling explicitly; browser localStorage is not a simulated backend.

## CI

Keep `npm ci` and every quality check enabled. Diagnose dependency installation from the actual failing step, compare the complete lockfile rather than only its root dependencies, and reproduce clean installation independently of the working `node_modules`. Runtime versions should be explicit and reproducible. Local results are not evidence of a successful GitHub run until that run has actually completed.
