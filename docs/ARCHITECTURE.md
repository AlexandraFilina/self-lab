# Architecture

The existing Next.js App Router application keeps its visual system and feature-based structure.

- `src/app`: route entrypoints and metadata. Routes compose features rather than implementing domain rules.
- `src/components`: shared layout, UI primitives, icons, and workspace loading/error and explicit import presentation.
- `src/features/experiments/model`: types, Zod validation, date rules, immutable actions, and pure descriptive analytics.
- `src/features/experiments/data`: preserved legacy fixtures, explicit migration, sample creation, and operation-level repository contracts, HTTP adapter, and read-only local import.
- `src/features/experiments/context`: post-mount API loading, current local date, serialized persistence, and typed UI actions.
- `src/features/experiments/components`: creation, check-in, metric selection, saved entries, and comparison presentation.
- `src/features/dashboard`: the existing dashboard presentation using the same experiment source.
- `src/i18n`: one real English dictionary, typed access, and locale-aware formatting. No language switcher or fictional translations.
- `src/app/api`: Next.js Route Handlers using the default Node.js runtime.
- `src/server`: server-only pool, scoped PostgreSQL repository, normalized schema, and mapper.
- `drizzle`: versioned SQL migrations and generated metadata.
- `scripts`: explicit migration, workspace seed, and database health commands.
- `tests`: Node/tsx unit tests, real PostgreSQL integration tests, and Chrome/CDP browser flows.

## Domain and migration

The implemented mode is `daily_habit`. A discriminant provides a boundary for future modes without implementing unused A/B behavior. An experiment has a question, habit, duration, selected metrics, and dated observations.

New observations require an explicit `done` or `not_done` status. Optional metric values are absent until selected. Legacy A/B entries retain their original scores, IDs, notes, dates, and conditions. Their habit status is unknown, so they are visible but excluded from done/not-done comparisons. The full legacy source is retained for traceability.

`observedDate` is a date-only calendar string. New check-ins can be created only for today or yesterday within the observation window. Earlier saved entries can still be edited. `recordedAt` is the first successful save instant; `updatedAt` starts as null and changes on edit. Save/edit instants use ISO UTC timestamps; the observation day uses local calendar semantics. Version-five migration preserves version-one through version-four observations without fabricating unknown timestamps. Existing built-in IDs remain unchanged when metric arrays are converted to definitions.

Date-only strings represent calendar dates. The current date is obtained from local browser date parts, not a UTC slice. Analytics use supplied data and dates without reading storage or a hidden clock.

## Explicit lifecycle

`Experiment.status` is Active or Completed; dates never determine that status. `completedAt` is an ISO timestamp or null for Active/unknown historical completion. `targetExtensions` stores previous/new duration and `extendedAt`. `getProgress` exposes explicit completion separately from `windowComplete`, calendar elapsed days, and recorded-day progress.

`model/lifecycle.ts` validates finish, extend, and reopen commands as pure transformations. Finish accepts sparse or empty data. Reopen clears completedAt and keeps the same ID, metrics, entries, and extension history. Extend preserves observation dates, appends consecutive duration history, and enforces the existing 365-day total limit. If the old target expired, extension starts today. The API validates the browser's IANA time zone; the server computes its current calendar date in that zone and supplies actual save instants. The provider serializes operations and updates UI only after server confirmation.

Storage version 5 adds lifecycle to validated version 4 data. Older user experiments become Active without inventing a finish decision. Only the explicitly identified current completed sample becomes Completed; unknown completion instants remain null. Old storage schemas remain separate from the current schema so new required fields do not break historical validation. `observedWindowDays` limits missing-day counts to elapsed days when a real early-finish timestamp exists. The idempotent retired-sample content cleanup remains separate from the schema migration and never removes user-owned records.

`ExperimentLifecycle` shares target-complete actions between Dashboard and Details. Native confirmation/extension dialogs retain the Strict Mode close guard. Finish is a secondary header action on active Details, including before the target date. Confirmation shows elapsed/recorded/missing counts with a Keep observing dismissal. Finish navigates to `#results`; Reopen is secondary. New entries require Active status, while saved-date edits remain possible after completion. Dashboard statistics and list filters use the same explicit lifecycle via `getProgress`.

## Metric definitions

Each experiment owns its metric definitions. A definition distinguishes `built_in` from `custom`, has a stable ID, and includes numeric scale metadata (`kind`, `min`, `max`, `step`). Built-in IDs remain sleep/mood/productivity/energy and resolve display labels through i18n. Custom IDs are `custom_` followed by a UUID; their trimmed labels are user content, limited to 40 characters. Labels never serve as score keys. Duplicate selected names are rejected case-insensitively, including built-in labels and IDs.

All currently accepted scales are numeric 1–10 with step 1. Sliders, validation, charts, and analytics consume scale metadata, while unsupported scale variants are rejected. Boolean, duration, count, alternative ranges, and a global custom metric library are not implemented.

Analytics receive a metric ID and numeric scale separately from the display label. Chart series with one scored observation contain a point, no line, and a localized explanation. `buildChartSegments` takes sorted recorded observations and produces solid segments for adjacent calendar dates and dashed segments for gaps. It never creates values, rejects unordered/duplicate dates, and is shared by built-in/custom series. Missing-score calendar days are crossed with dashed bridges and a dictionary explanation. Circles and tooltips exist only for actual recorded scores. Coincident scores do not imply a relationship between metrics.

## Results presentation

`compareMetric` groups saved observations by explicit habit status and summarizes valid scores separately for each metric ID. It exposes averages, counts, absolute difference, relative difference, missing-score counts, excluded observations, conclusion, and data-strength label. `calculateRelativeDifference` validates finite averages and a positive denominator; percentages remain unavailable until both scored groups have at least five observations. `formatRelativePercent` formats whole percentages without negative zero.

The existing half-point similarity rule suppresses directional headlines for small absolute differences. `getResultDirection` describes other relative differences below 10% as slight. `getDataStrength` uses the smaller scored group with boundaries 5 and 10; these are descriptive counts, not confidence. No scores are pooled across metrics. `getResultsEnding` selects only supportive dictionary copy from the independent metric results.

`ResultsComparison` renders per-metric cards and an expandable calculation table in its existing layout slot. The chart retains its position. `DailyObservations` reads explicit status and wraps the existing editable table in a closed native disclosure for completed experiments, including empty ones; active tables remain expanded. A stable callback-ref cleanup closes the disclosure when Activity hides the route, and a lifecycle key resets it after transitions. Legacy conditions use a separate compact native disclosure. All system copy comes from i18n, while custom names remain user content.

## PostgreSQL persistence boundary (Stage 8A)

```text
Next.js client UI → ExperimentsRepository → HTTP adapter
  → Route Handler → PostgreSQL repository → Drizzle / pg → PostgreSQL
```

Route Handlers preserve the existing client provider/forms without introducing a second mutation framework. Neither UI nor analytics imports SQL or a database client. DB connection and repository modules import `server-only`; no credentials use the NEXT_PUBLIC prefix. A lazy process-level pool permits building without a live database. Development E2E selects an isolated `.next-browser` build directory so it can run alongside the user's ordinary dev server. The existing Cache Components/Partial Prefetching settings are unchanged; `connection()` opts API reads into request-time execution, outside error handling so Next prerender signals are not swallowed. Explicit route-level runtime declarations are incompatible with this installed Next version's Cache Components; Node.js is already the default.

`ExperimentsRepository` exposes list/get/create/saveEntry/changeLifecycle/importStatus/importExperiments. The old snapshot interface is retained under `WorkspaceSnapshotRepository` solely for compatibility tests and the legacy adapter. The runtime provider always selects the HTTP implementation; its operation results replace individual experiments only after success. Imports and mutations share a serialized queue. No optimistic state or browser-storage write masks a network/database failure. Failures retain form input and provide retry; missing backend data never silently falls back to an old local snapshot.

Reads use repeatable-read read-only transactions. Entry and lifecycle writes lock the experiment row, validate with existing domain functions, then commit all affected rows together. Same-date upsert preserves public entry ID and recordedAt, replaces score rows atomically, and sets updatedAt. A failed score insertion rolls back the entire entry edit. Creation uses a stable client request UUID reused after response loss. Extension requests carry persistent request IDs to avoid double extension after retry. Finish/Reopen already in the requested state are idempotent. Concurrent edits currently use last-successful-write semantics; revision-based conflict resolution is not implemented.

### Normalized schema and constraints

- `workspaces`: UUID, display name, creation instant. No user identity yet.
- `experiments`: internal UUID, preserved public ID, workspace FK, daily-habit question/habit/title, explicit lifecycle, start DATE, target duration, completion/save timestamps. UNIQUE(workspace, public ID).
- `experiment_metrics`: internal UUID, experiment FK, stable domain metric ID, nullable custom label, kind, scale metadata, position. Unique stable ID and position within the experiment.
- `daily_entries`: internal UUID, preserved public ID, experiment FK, observed DATE, explicit or legacy-null status, note, save/edit instants, origin. UNIQUE(experiment, observed DATE) and UNIQUE(experiment, public ID).
- `daily_entry_values`: entry/metric composite primary key and numeric score. Composite FKs including experiment ID prevent cross-experiment values.
- `experiment_target_extensions`: experiment FK, ordered previous/new duration history, timestamp, optional API request receipt fields.
- `local_imports`: workspace FK plus SHA-256 backup fingerprint, imported instant. The receipt survives subsequent server-side edits.

Child rows cascade only when their experiment is explicitly removed at the data layer; the product exposes no delete API. Workspace deletion is RESTRICT to prevent accidental wholesale deletion. Database CHECKs cover supported mode, user-only source, lifecycle states, duration, metric kinds/labels/scales, status/origin pairing, integer 1–10 values, and extension progression. Cross-row window and time-zone rules run under a transaction lock in domain validation.

The optional `legacy_archive` JSONB holds only the original historical A/B source for traceability. Current experiments, observations, metrics, and scores are normalized; no workspace snapshot blob is stored. `toExperiment` is the single row-to-domain mapper. Observed/start dates stay date strings. Timestamptz values normalize to UTC while retaining PostgreSQL microsecond precision; unknown imported timestamps remain null. DB-only createdAt/updatedAt fields remain internal because the existing UI domain has no experiment creation timestamp.

### Explicit local import and samples

`readLocalExperiments` reads the browser key and invokes the pure version 1–5 decoder. It never calls the legacy adapter's migration-write path, rewrites the key, or deletes data. Only source:user records become candidates. Corrupt/unsupported storage is reported separately while a healthy server workspace stays usable.

The user must choose Move local experiments. The server validates the entire bounded payload, locks the workspace for concurrent imports, inserts missing normalized records, and commits an import receipt in the same transaction. Existing identical IDs are skipped; different data produces an atomic conflict, never overwrite. Receipt replay skips the same backup even after those server records change. Changing the backup creates a different receipt and can require explicit conflict resolution; automatic merging and large-batch import are not implemented. The untouched browser copy remains a backup. Existing local schema migration and sample-cleanup functions are retained/tested as legacy compatibility, not invoked to write storage during backend loading.

The current completed sample is appended client-side as a labelled read-only fixture after successful server loading. Its ID cannot shadow a user-owned record with the same ID. No sample enters database operations, Dashboard daily tasks, or the import. Entry/lifecycle controls are hidden for samples and provider operations enforce user source.

### Loading and hydration

The provider always renders layout children, both before and after its post-mount API load. The route-local boundary shows loading/error content inside the page segment; it never removes Dashboard from the server render tree. Local calendar updates remain independent of persistence. Invalid local backup data cannot replace database content.

### Request/security boundary

Mutation requests validate same-origin headers when present, reject cross-site Fetch Metadata, and use no permissive CORS. This is CSRF hardening, not authentication or an authorization boundary. Routes enforce JSON and a streamed 2 MiB limit, Zod bounds, supported time zones, and source:user imports (max 100 experiments). SQL inputs are parameterized through Drizzle. API errors expose stable codes only, not SQL, credentials, or server stack traces.

The anonymous workspace must be explicitly enabled with server-only environment settings; every query is scoped to that workspace. All visitors to this local server share it. It is not a private account or production security model. The database binds only to loopback in Compose. No reset runs on startup. Apply reviewed migrations explicitly; workspace seed is idempotent and development-only.

## Form lifecycle

Next.js preserves inactive routes with React Activity. The creation form uses controlled question/title/habit/target/metric fields and a stable callback-ref cleanup to reset the native form and all React state when its route is hidden, as well as after a successful creation. Question/details steps preserve the same draft during Back/Continue; they do not remount the form ref. Cleanup resets React state directly because the native reset event alone is not reliable while Activity detaches event handling. Validation and server errors do not detach that ref, so input survives a failed submission. Browser tests use visible elements to avoid interacting with an inactive preserved route.

## Onboarding and ideas

`needsOnboarding` checks explicit user origin, not sample presence, experiment count, title, or status. Dashboard renders `NewExperimentForm` in onboarding mode for empty/sample-only workspaces; `/experiments/new` uses the same component for existing users. No provider or route children are hidden during hydration.

The first submit validates `experimentQuestionSchema`, also used by the full domain schema, and reveals the remaining fields without saving. Final submit reuses existing full validation, custom-metric actions, provider serialization, and repository persistence. `data/experiment-ideas.ts` defines five typed presets using dictionary copy and built-in metric IDs. `createIdeaDraft` creates an editable draft only on selection; `createEmptyExperimentDraft` contains no example text or selected metrics. Custom metrics use the unchanged experiment-local implementation.

The same successful creation produces a user-owned Active experiment with an empty entries array. Existing Details check-in controls provide the next step. Onboarding state is derived from loaded user records; the local backup format remains version 5.

## Dashboard daily workflow

`features/dashboard/model/daily-workflow.ts` is a pure selector over experiments and a supplied local calendar date. It filters explicit Active/user origin, derives date-specific entry availability, partitions pending/checked rows without changing group order, and computes a summary for targets that include today. Expired Active targets remain rows with lifecycle actions; a separate flag explains counter eligibility and suppresses caught-up copy while a target decision is pending. Older absent dates never become tasks.

`TodaysCheckIns` reads the shared provider and renders compact rows above the existing statistics. Its Check in/Edit/Add yesterday buttons pass an explicit date and localized label to `DailyEntryButton`; the form, validation, save/update semantics, and repository are unchanged. `ExperimentLifecycle` has an inline presentation for expired rows with the same commands and dialogs. The focused experiment is user-owned; fictional samples do not become daily tasks. The same UI flow now persists through per-operation HTTP requests to PostgreSQL.

## Native dialog lifecycle

Check-in uses the existing native modal. Development Strict Mode replays effect setup/cleanup: showing, closing, and showing the dialog can queue a close event while it is open again. The close handler dismisses only if the dialog is currently closed. This preserves real Escape/close behavior without dismissing a reopened dialog. Selecting an observation day mounts the form for that date and loads only that date’s existing values.

Archive and permanent delete remain roadmap work; no destructive controls are implemented.

## Stage 8B and production

Authentication and user/workspace ownership are not implemented. Stage 8B must replace the environment-selected shared workspace with a trusted authenticated identity, authorize every read/write/import, and add cross-user isolation tests. Repository operations already accept a server-side workspace scope; ownership must never come from an untrusted client field. Keep pure domain validation, analytics, stable metric IDs, form components, normalized schema, and mapping.

Future production can use managed PostgreSQL with production pool/TLS policy, managed secrets, backups, migrations, monitoring, deployment hardening, and a deliberate retention policy. No managed service or hosting is configured in Stage 8A.

## Tests and CI

Node/tsx unit tests preserve existing pure domain, migration, legacy repository, chart, result, onboarding, and daily workflow coverage. New local-import tests verify backup reads never write and validate API/date contracts. Real PostgreSQL integration tests apply the checked-in migration in a guarded test database and use random workspaces. They verify normalization, SQL-like input safety, custom scores, missing scores, unique constraints, concurrency, lifecycle, extension retry, transaction rollback, legacy/import preservation, import conflicts/receipts, and FK isolation.

Browser tests use actual Chrome/CDP input and a fresh profile, run their own production or development Next server, and select a random workspace in the test PostgreSQL database. Domain fixtures are arranged only inside that test scope; browser actions go through HTTP and are checked with independent PostgreSQL queries. See README for exact commands and coverage. No API test-reset endpoint exists. Test cleanup deletes only that run's workspace rows; no global truncate/drop/reset script exists.

CI starts a disposable PostgreSQL 17 service with test-only credentials, retains clean installation and all existing quality gates, and adds real DB plus production/development browser checks. Local results are not evidence that a GitHub run has passed; the remote workflow requires a later authorized push.
