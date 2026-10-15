# Project rules

- Work in this existing Next.js application. Preserve its visual design, palette, typography, logo, sidebar, and working components unless the user explicitly requests a change. Limit UI changes to the scenario being implemented.
- Communicate with the user in Russian. Keep application UI, source identifiers, fixtures, documentation, and validation messages in English. Put user-facing copy in the typed localization dictionary.
- Use strict TypeScript. Avoid `any`, duplicated logic, hidden errors, and disabled lint rules.
- Keep UI, domain rules, analytics, and persistence separate. Use the existing feature structure and implement only necessary extension points.
- Explain why a dependency is needed before adding it. Prefer the existing stack and small solutions.
- Daily habit comparison is the current experiment mode. `done`, `not_done`, unclassified imported observations, and missing check-ins are distinct. Never infer that a missing check-in means the habit was not completed.
- Do not preselect metrics for blank new experiments. Idea presets may populate editable fields only after an explicit user selection. Custom metric definitions belong to one experiment, use stable UUID-based IDs independent of labels, and reject empty or case-insensitive duplicate selected names. Resolve built-in labels through i18n; preserve custom labels as user content. Only numeric 1–10 scales are implemented; use scale metadata in consumers. A single observation must not be rendered as a trend line.
- Preserve legacy sample data through explicit, tested migration. Do not silently rescale stored metrics or invent habit completion for old observations.
- Use the user's local calendar date. New check-ins are limited to today/yesterday inside the experiment window; older saved observations remain editable. Keep observedDate separate from recordedAt/updatedAt and preserve unknown historical timestamps as null. Reject future check-ins and duplicate experiment/date pairs. Persist through the repository boundary, never directly from a UI component.
- Clearly label browser-only storage and fictional samples. Never present non-persistent actions, missing integrations, or unavailable features as working.
- Analytics must use saved observations and deterministic, tested rules. Handle missing values, empty groups, and small samples honestly. Do not use AI APIs for user conclusions, imply causation, or claim statistical significance without a justified method.
- Results are per metric: relative differences describe reported scores, never improvement or causation. Suppress percentages below five scored observations per group; show data quantity labels, never statistical confidence. Keep completed observations collapsed with editing available, and legacy conditions secondary.
- Lifecycle is explicit: elapsed targets stay Active until Finish. Preserve observations and target extension history; Reopen clears completedAt without copying data. Completed experiments permit edits, but require Reopen for new entries. Keep schema migration separate from sample cleanup; never infer a user finish decision from dates. Archive and permanent delete are not implemented.
- Reuse the question-first New Experiment form for onboarding and later creation. Derive onboarding from the absence of user-origin experiments, not samples or status. Keep sample exploration separate and ideas non-prescriptive. Never create automatic check-ins.
- Dashboard daily tasks include only Active user experiments; keep samples and Completed out. Preserve pending-first/stored order, reuse the existing check-in flow, and offer only eligible Today/Yesterday creation. Older missing days never become a backlog. Expired Active targets stay visible for lifecycle decisions; counters must not include unavailable dates.
- Add tests for domain logic and critical user flows. Run available formatting, lint, type, test, and production build checks after changes. Report commands actually run and their results.
- Never publish secrets or user data. Do not rewrite Git history or force-push. Do not commit or push without the user's explicit confirmation for the current changes.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
