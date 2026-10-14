# Habit Experiments

A personal A/B tracker for exploring how small routine changes relate to sleep, mood, and productivity. Ask a question, record your usual routine in period A, try one change in period B, and compare your observations.

Built with Next.js App Router, React, TypeScript, Tailwind CSS, and adapted shadcn/ui primitives. The application, fixtures, validation messages, accessibility labels, and documentation are in English.

## Getting started

Use Node.js 24 LTS and npm.

```bash
npm ci
npm run dev
```

Open [localhost:3000/dashboard](http://localhost:3000/dashboard). The root URL redirects to the dashboard.

```bash
npm run build
npm start
```

Development and production builds use Webpack. Tailwind 4 runs through its standard PostCSS adapter. System fonts keep the build independent of external font downloads.

## Features

- **Dashboard:** active and completed experiment counts, daily check-ins, current period, recorded-day progress, and score trends.
- **Experiments:** reusable experiment cards and status filters.
- **New experiment:** a hypothesis, A/B conditions, independently configurable durations, and selected metrics.
- **Experiment details:** daily scores and notes, period boundaries, trends, and preliminary or completed comparisons.
- **Daily check-in:** scores from 1 to 10, optional context, and editing an existing entry without creating a duplicate.
- **Responsive UI:** desktop sidebar, mobile navigation, keyboard focus, accessible native dialogs, and tables that scroll within their cards.

## Demo behavior

All sample observations are fictional. The reference date is **October 13, 2026** and is displayed in the UI. Experiments and check-ins created during a session stay in memory until a page reload. Reloading a newly created experiment URL displays an explanation that the demo session has reset.

There is no database, authentication, API layer, or browser persistence in this stage. The reference date and initial fixtures are supplied explicitly at the application boundary.

Calendar days determine the current period and completion. Progress counts recorded days, so missed days remain unfilled. Charts leave gaps where observations are missing. Comparisons use available scores, show sample sizes, and report differences in points. Missing averages stay empty. Differences do not establish causation; workload, weekends, and other circumstances can also affect the observations.

## Architecture

```text
src/
  app/                           Thin route entrypoints, metadata, and global styles
    dashboard/
    experiments/
      new/
      [id]/
  components/                    Shared layout, headings, icons, and UI primitives
    ui/
  features/
    dashboard/components/        Dashboard presentation
    experiments/
      components/                Forms, cards, charts, comparison, and details
      context/                   Session state and typed user actions
      data/                      Fictional fixtures
      model/
        types.ts                 Domain types and metric IDs
        metrics.ts               Metric labels, descriptions, and colors
        schemas.ts               Shared Zod schemas and input limits
        analytics.ts             Pure date, progress, and comparison calculations
        actions.ts               Validated actions and immutable reducer
  lib/
    config.ts                    Application name, English locale, and demo date
    format.ts                    English date, number, and count formatting
    utils.ts                     UI class-name composition

tests/                           Domain, validation, reducer, and formatting tests
.github/workflows/ci.yml          Automated checks on pushes and pull requests
```

Routes compose features. Shared components do not own experiment rules. Analytics accept a reference date and do not import fixtures or read a hidden clock. Forms and state actions use the same Zod schemas, with limits defined once. The reducer updates state immutably and preserves one entry per experiment date.

`ExperimentsProvider` accepts initial experiments and a reference date. Presentation components access its typed context through `useExperiments()`. This keeps session behavior behind a clear boundary without pretending to provide a backend.

### Extending the application

- Add a metric to the metric IDs, catalog, score schema, and fixtures; the forms, legend, comparison, and daily table iterate over selected metrics.
- Keep calculations and validation in the model layer and test them independently of React.
- For Supabase, implement real persistence behind the context boundary, then add loading and error states, user ownership, authentication, server validation, and row-level security.
- When using real dates, supply the user's calendar date consistently instead of the fixed demo reference date.
- Add chart or form libraries when interaction requirements justify them. The current SVG chart and native inputs keep the demo small.

## Quality checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run format` applies Prettier. Tests use the built-in Node.js test runner through tsx. They cover validation limits, period boundaries, daylight saving changes, missing scores, empty comparisons, immutable updates, and duplicate-free check-in edits. CI runs the same checks against a clean npm installation.

For a browser review, create an experiment with one metric, record a day, edit it, switch filters, navigate between routes, and reload the page. Test at desktop and mobile widths and close the check-in dialog with Escape.

## Dependencies and attribution

Zod provides shared runtime validation. Radix Slot, class-variance-authority, clsx, and tailwind-merge support the adapted shadcn/ui primitives. Prettier and tsx are development tools. Third-party attribution is retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The existing ESLint dependency chain currently reports five high-severity development advisories involving `braces`. The production dependency audit reports none. Review this separately before expanding the toolchain; a forced major-version downgrade is not part of this frontend change.
