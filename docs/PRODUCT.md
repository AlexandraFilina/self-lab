# Product

self lab is a personal laboratory for small experiments in everyday life. Its value is self-discovery through personal observations, not maintaining endless habit streaks.

## Current experience

1. Ask a concrete question and describe one habit.
2. Start immediately using daily habit comparison.
3. Choose today or yesterday within the experiment window, then record whether the habit was done or not done, score the selected metrics, and optionally add context.
4. Edit a saved observation without creating another entry. Earlier saved dates remain editable; new observations cannot be backfilled before yesterday.
5. Compare reported scores on done and not-done days once each metric has enough observations in both groups.

A missed check-in is missing data, not a not-done day. Imported A/B observations with no completion information remain explicitly unclassified. Fictional samples are labelled and kept separate from the claim that these are the user's own measurements.

## Measurement and interpretation

Scores remain integers on the existing 1–10 scale. The metric control adds human-readable descriptions without changing stored values. Empty optional metric values remain missing and are excluded separately for each metric.

Report group sizes, averages, and signed differences in scale points. Do not call a relative change in a subjective score a percentage improvement in mood. Do not impute missing values. Require at least five scored observations in each group before offering a directional comparison; this is a descriptive product rule, not a test of statistical significance. Small or unbalanced samples, self-reporting, selection effects, and confounding circumstances limit interpretation.

Rule-based summaries describe associations only. They never state that performing a habit caused a change, and no AI API generates them.

## Storage and privacy

This stage uses browser localStorage without an account or cross-device synchronization. Reads and writes may fail; show failures and keep unsaved input. Corrupt or unsupported saved data must not be silently overwritten. Historical samples and their original scales are preserved through a versioned adapter.

## Future possibilities

- Supabase persistence, authentication, user ownership, and row-level security.
- Additional experiment modes, including scheduled A/B periods.
- More contextual metrics and carefully explained descriptive comparisons.
- Additional locales using the existing typed dictionary boundary.

These are roadmap items, not current features. Paid services, research-based recommendations, AI APIs, push notifications, and complex statistical models are out of scope.
