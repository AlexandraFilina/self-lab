# Product

self lab is a personal laboratory for small experiments in everyday life. Its value is self-discovery through personal observations, not maintaining endless habit streaks.

## Current experience

1. Ask a concrete question and describe one habit.
2. Explicitly select built-in metrics or add custom metrics for this experiment, then start daily habit comparison. No metric is preselected.
3. Choose today or yesterday within the experiment window, then record whether the habit was done or not done, score the selected metrics, and optionally add context.
4. Edit a saved observation without creating another entry. Earlier saved dates remain editable; new observations cannot be backfilled before yesterday.
5. Compare reported scores on done and not-done days once each metric has enough observations in both groups.

A missed check-in is missing data, not a not-done day. Imported A/B observations with no completion information remain explicitly unclassified. Fictional samples are labelled and kept separate from the claim that these are the user's own measurements.

## Measurement and interpretation

Custom metric names are required, trimmed, at most 40 characters, and unique among selected metrics regardless of case. They can be removed before creating the experiment. Custom metrics are local to one experiment, not a shared library.

Scores remain integers on the existing 1–10 scale. The metric control adds human-readable descriptions without changing stored values. Empty optional metric values remain missing and are excluded separately for each metric.

Give each metric its own “What you observed” card. Calculate relative difference as `(done average - not-done average) / not-done average * 100` from unrounded means, rounding the result to a whole percentage. Do not show a percentage for missing/non-finite averages, non-positive denominators, or fewer than five scored observations in either group. Do not call a relative change in a subjective score a percentage improvement in mood. Do not impute missing values.

Differences within half a scale point have the primary headline “No clear difference”. Other relative differences below 10% use “Slightly higher/lower on done days”. Data strength uses the smaller scored group: fewer than 5 → “Too early to compare”, 5–9 → “Early pattern”, at least 10 → “Pattern worth noticing”. These describe data quantity, not statistical confidence. Calculation details explain averages, scored counts, missing scores, excluded observations, formula, and limitations. A calm ending supports pattern, similar, and insufficient outcomes without pressure.

The only seeded example is the completed 28-day fictional daily experiment. It contains 13 done, 8 not-done, and 7 missing days with overlapping scores. Completed tables start collapsed and retain editing. Legacy conditions sit in a compact secondary disclosure, absent from new experiments. Small or unbalanced samples, self-reporting, selection effects, and confounding circumstances limit interpretation.

A metric with one scored observation shows a point and an explanation rather than a trend line. Adjacent recorded days connect normally; dashed bridges cross days without recorded scores and never create observations or missing-day tooltips. Identical scores across metrics do not establish a relationship. Numeric scale metadata leaves room for later measurement types, but only 1–10 numeric scores are currently supported.

Rule-based summaries describe associations only. They never state that performing a habit caused a change, and no AI API generates them.

## Storage and privacy

This stage uses browser localStorage without an account or cross-device synchronization. Reads and writes may fail; show failures and keep unsaved input. Corrupt or unsupported saved data must not be silently overwritten. Historical samples and their original scales are preserved through a versioned adapter.

## Future possibilities

- Supabase persistence, authentication, user ownership, and row-level security.
- Additional experiment modes, including scheduled A/B periods.
- More contextual metrics and carefully explained descriptive comparisons.
- Additional locales using the existing typed dictionary boundary.

These are roadmap items, not current features. Paid services, research-based recommendations, AI APIs, push notifications, and complex statistical models are out of scope.

Retired fictional examples are cleaned up by stable ID and explicit sample origin. User-owned experiments are never deleted by this cleanup, including imports with matching IDs or titles. Legacy fixtures remain in migration tests.
