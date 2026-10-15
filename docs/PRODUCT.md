# Product

self lab is a personal laboratory for small experiments in everyday life. Its value is self-discovery through personal observations, not maintaining endless habit streaks.

## Current experience

1. Ask a concrete question and describe one habit.
2. Explicitly select built-in metrics or add custom metrics for this experiment, then start daily habit comparison. No metric is preselected.
3. Choose today or yesterday within the experiment window, then record whether the habit was done or not done, score the selected metrics, and optionally add context.
4. Edit a saved observation without creating another entry. Earlier saved dates remain editable; new observations cannot be backfilled before yesterday.
5. Finish when ready, or extend the observation target. Reaching the target never completes the experiment automatically.
6. Compare reported scores on done and not-done days once each metric has enough observations in both groups.

A missed check-in is missing data, not a not-done day. Imported A/B observations with no completion information remain explicitly unclassified. Fictional samples are labelled and kept separate from the claim that these are the user's own measurements.

## Question-first onboarding

Dashboard shows “What would you like to understand about yourself?” when no experiment has `source: "user"`, including empty and sample-only workspaces. Existing user experiments bypass onboarding regardless of Active/Completed status. Sample exploration stays separate through a labelled secondary link when a sample is available.

The same New Experiment form handles onboarding and subsequent creation. First enter a required question in an empty field, then Continue to an editable name, habit/change, built-in or custom metrics, and observation target. No metric is selected in a blank draft. The target explains that users can finish earlier or keep observing later. Back to question preserves unsaved fields; leaving the route resets the draft. Failed validation or writes preserve input.

“Need an idea?” offers five small presets: Morning walks & mood, Coffee & sleep, Screen time & sleep, Exercise & energy, and Focus sessions & productivity. Clicking one fills a question, title, habit, relevant built-in metrics, and a 14-day target. Every field remains editable. Presets are inspiration, not scientific recommendations; no AI API interprets the question.

Creation persists a user-owned Active experiment and navigates to Details with “Start observing today” and Check in. It never creates a check-in automatically. Onboarding needs no additional storage fields or migration.

## Daily workflow

Dashboard answers what to check in today with compact rows for all Active user-origin experiments. Samples and explicitly Completed experiments are excluded. Rows without today's entry come first; each group preserves the stored experiment order. A Done entry and a Not done entry are both real observations and display “Checked in today” with Edit. Successful saves update the shared provider state immediately.

Add yesterday is a quiet secondary action only for a missing yesterday inside the observation target. There is no queue for older missing dates, no warning colors, and no guilt copy. Check in, Edit, and Add yesterday all reuse the existing date-specific check-in dialog and domain validation. Today and yesterday use the provider's local calendar date.

The daily summary counts Active user experiments within today's observation dates. Expired targets remain visible with the existing Finish / Keep observing actions and an explanation of the counter; they are never silently completed or converted into unavailable Today tasks. A target decision prevents a misleading caught-up message. No 0/0 counter is displayed. Onboarding and the existing empty state remain available when there are no user experiments or no Active user experiments respectively.

## Experiment lifecycle

Experiments have an explicit Active or Completed state. An elapsed target remains Active, with “Your observation window is complete”, recorded/target counts, “Finish & view results”, and “Keep observing”. Early finish is a secondary action and asks for confirmation with elapsed days, recorded observations, and Done / Not done counts. Finishing with sparse or no observations is allowed; results remain honest about insufficient data.

Keep observing adds 7, 14, or custom positive whole days, up to a total target of 365 days. If the old target has already passed, added days start today; the preview shows the new target date. Historical dates and values never shift. Extensions store previous/new durations and timestamps. Reopen changes the same experiment back to Active, clears completedAt, and keeps observations and extension history. If its target is still expired, it offers the finish/extend choice again.

Completed experiments allow editing saved observations; reopen is required before creating new check-ins. Completion timestamps are real save instants. Migration does not infer a user's finish decision from elapsed dates. Early-finished experiments do not count future target days as missing check-ins.

## Measurement and interpretation

Custom metric names are required, trimmed, at most 40 characters, and unique among selected metrics regardless of case. They can be removed before creating the experiment. Custom metrics are local to one experiment, not a shared library.

Scores remain integers on the existing 1–10 scale. The metric control adds human-readable descriptions without changing stored values. Empty optional metric values remain missing and are excluded separately for each metric.

Give each metric its own “What you observed” card. Calculate relative difference as `(done average - not-done average) / not-done average * 100` from unrounded means, rounding the result to a whole percentage. Do not show a percentage for missing/non-finite averages, non-positive denominators, or fewer than five scored observations in either group. Do not call a relative change in a subjective score a percentage improvement in mood. Do not impute missing values.

Differences within half a scale point have the primary headline “No clear difference”. Other relative differences below 10% use “Slightly higher/lower on done days”. Data strength uses the smaller scored group: fewer than 5 → “Too early to compare”, 5–9 → “Early pattern”, at least 10 → “Pattern worth noticing”. These describe data quantity, not statistical confidence. Calculation details explain averages, scored counts, missing scores, excluded observations, formula, and limitations. A calm ending supports pattern, similar, and insufficient outcomes without pressure.

The only read-only fixture is the completed 28-day fictional daily experiment. It contains 13 done, 8 not-done, and 7 missing days with overlapping scores. Completed user tables start collapsed and retain editing; fictional samples are read-only. Legacy conditions sit in a compact secondary disclosure, absent from new experiments. Small or unbalanced samples, self-reporting, selection effects, and confounding circumstances limit interpretation.

A metric with one scored observation shows a point and an explanation rather than a trend line. Adjacent recorded days connect normally; dashed bridges cross days without recorded scores and never create observations or missing-day tooltips. Identical scores across metrics do not establish a relationship. Numeric scale metadata leaves room for later measurement types, but only 1–10 numeric scores are currently supported.

Rule-based summaries describe associations only. They never state that performing a habit caused a change, and no AI API generates them.

## Storage and privacy

Stage 8A stores user experiments in local PostgreSQL through a server-only API/repository boundary. It uses one shared development workspace with no authentication or private user ownership. Database/network failures must preserve input and never show false success.

LocalStorage is now an untouched compatibility backup. Moving valid local user experiments requires explicit confirmation via the import action; samples are excluded. Import preserves IDs, dates, lifecycle, custom metrics, and known timestamps, rejects conflicting data atomically, and does not repeat the same backup. Corrupt local data is reported without replacing database content.

Fictional examples remain labelled, read-only fixtures. They never become real database records.

## Future possibilities

- Stage 8B: authentication, authorized user/workspace ownership, and isolation tests.
- Production infrastructure: managed PostgreSQL, server secrets, operational backups, and deployment hardening.
- Additional experiment modes, more measurement types, descriptive comparisons, and locales.
- Archive/permanent delete with a deliberate retention design; neither is implemented now.
- Explicit import conflict resolution and batching for backups above current request bounds.

These are roadmap items, not current features. Hosting, AI APIs, push notifications, paid services, and complex statistical models are out of scope. No Supabase integration is planned.
