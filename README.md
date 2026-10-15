# Self Lab

Personal habit experiments: record Done / Not done observations, optionally score built-in or custom metrics, and compare reported scores without claiming causation.

Stage 8A adds a real PostgreSQL backend to the existing Next.js application. The visual system and pure domain/analytics rules are preserved. Authentication is **not implemented**: this stage uses one explicitly enabled, shared development workspace. Run it on trusted localhost; workspace IDs are not access credentials.

## Local setup

Requires Node.js from [.nvmrc](.nvmrc), Docker Desktop with Compose, and Chrome for browser tests.

1. Copy [.env.example](.env.example) to `.env.local`.
2. Replace `CHANGE_ME` with a locally generated password in **all three places**: `POSTGRES_PASSWORD`, `DATABASE_URL`, and `TEST_DATABASE_URL`. For example, generate a hex password with `node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"`. Hex needs no URL escaping. Never commit the resulting file.
3. Start development PostgreSQL, install dependencies, and apply migrations:

```bash
docker compose up -d --wait
npm ci
npm run db:migrate
npm run db:seed
npm run db:status
npm run dev
```

Open [localhost:3000/dashboard](http://localhost:3000/dashboard). The development workspace is created idempotently. Seed creates only that workspace; fictional experiments remain read-only frontend fixtures and are never inserted into PostgreSQL.

Docker's CLI must be on PATH. On macOS, if Docker Desktop is running but `docker` is not found, enable its CLI tools installation or use `/Applications/Docker.app/Contents/Resources/bin/docker`.

```bash
docker compose ps
docker compose down
```

Development data persists in the named Docker volume across ordinary `down` / `up`. Do not remove the volume to apply a migration. PostgreSQL binds to localhost port 5432; the separate test service uses port 5433. Changing the password in the environment does not change an already initialized database user's password.

`npm run db:generate` generates a checked-in Drizzle migration after intentional schema changes. `db:migrate` applies pending migrations explicitly; the application never resets the database or automatically applies DDL. `db:seed` refuses production mode.

## Existing local data

Open the same browser and origin that held your old experiments. When valid user experiments exist under `self-lab:experiments`, a **Move local experiments to this workspace** action appears. It imports only after you click it.

Supported local versions 1–5 are decoded without changing the original browser value. IDs, dates, entries, custom definitions, lifecycle history, and known save/edit timestamps are preserved; unknown timestamps remain null. Fictional samples are excluded. The import is transactional and stores a receipt so the same backup is not imported repeatedly, even after server-side edits. Conflicting existing IDs reject the entire batch; they never overwrite server data.

The browser copy remains an untouched backup. Corrupt/unsupported backups produce an explicit import error without blocking a healthy database workspace. Imports are limited to 100 experiments and a 2 MiB request; larger imports require a later explicit batching workflow. There is no browser-storage fallback after a failed server write.

## Architecture

```text
UI / ExperimentsProvider
  → ExperimentsRepository
  → HTTP adapter / Next.js Route Handlers
  → server-only PostgreSQL repository
  → Drizzle / pg / PostgreSQL
```

- `src/app/api`: validated, size-bounded API routes and sanitized error envelopes.
- `src/server/db`: typed normalized schema and server-only connection pool.
- `src/server/experiments`: scoped operations, transactions, and explicit domain mapping.
- `src/features/experiments/model`: existing types, Zod rules, lifecycle, and analytics.
- `src/features/experiments/data`: HTTP repository, explicit local import, legacy compatibility, and sample fixtures.
- `src/features/experiments/context`: post-mount loading, serialized operations, local calendar clock, and confirmed server results.
- `src/i18n`: typed English system copy; custom names remain user content.
- `drizzle`: reviewed SQL migration and generated migration metadata.
- `tests/integration`: real PostgreSQL repository tests.
- `tests/browser`: real headless Chrome through CDP, HTTP API, and test PostgreSQL.

The database uses separate experiments, metric definitions, daily entries, metric values, extension history, and import receipts. A physical UNIQUE constraint on experiment/date prevents duplicate check-ins. `observed_date` is SQL DATE, while save/edit/completion instants are timestamptz. SQL values are parameterized; database credentials and the driver stay on the server.

See [ARCHITECTURE.md](docs/ARCHITECTURE.md), [PRODUCT.md](docs/PRODUCT.md), [AGENTS.md](AGENTS.md), and [third-party notices](THIRD_PARTY_NOTICES.md).

## Quality checks

Start both local services before database/browser tests:

```bash
docker compose --profile test up -d --wait
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
npm run test:browser
npm run test:browser:dev
```

Unit tests use Node's test runner with tsx. The PostgreSQL tests use a separate database whose name must end in `_test`; local hosts are required outside CI. Tests migrate that database, create random workspaces, and delete only their own rows, never development records.

Browser tests launch a real Chrome process with a temporary profile, send actual mouse/keyboard events, and start an isolated application server against a random workspace in the test database. Production mode uses port 3101 and requires the build first. Development mode starts its own `next dev --webpack` in the ignored `.next-browser` build directory, including Strict Mode and instant navigation validation. Do not point browser tests at your ordinary development workspace; the previous external-server option is no longer used.

The scenario checks creation/reload, a lost creation response with idempotent retry, empty metric validation, custom metric persistence, check-in/edit/reload without duplicates, dashboard counters, finish/results/reopen, explicit backup import, Today/Yesterday, expired-target extension, read-only samples, database save failure with retained input/retry, network retry, API validation, request-size/origin rejection, and mobile overflow. Direct queries confirm browser changes reached PostgreSQL. Console/runtime errors fail the test. Screenshot paths are printed. `SELF_LAB_CHROME_PATH` and `SELF_LAB_TEST_PORT` can override local executables/ports.

GitHub Actions uses its own disposable PostgreSQL service and test-only credentials. It does not connect to a production database. A successful local run does not establish the status of a remote GitHub run.

## Manual review

1. Create an experiment with a built-in and custom metric; reload and check both persist.
2. Save Done today and Not done yesterday when eligible. Leave a score unrated; it must stay missing. Edit a saved date and confirm only one entry remains.
3. Create a second experiment: its blank form must be empty with no selected metrics. Check both Dashboard and Details entrypoints.
4. Finish, inspect separate metric results, reload, and reopen. An elapsed target stays Active until explicitly finished.
5. In the original browser, explicitly import local experiments; verify their dates, timestamps, custom metrics, and lifecycle. The original localStorage value must remain unchanged.
6. Stop only the development database with `docker compose stop postgres`, try a save, and verify an error with retained input. Restart with `docker compose up -d --wait postgres` and retry. No success should be shown before the server confirms.
7. Review at phone width; samples should be labelled fictional and offer no editing or lifecycle actions.

## Next stages

Stage 8B: authentication, trusted user/workspace ownership, authorization, and the corresponding isolation tests. Future production infrastructure can use managed PostgreSQL. Hosting, account synchronization, archive/delete, additional scales, and additional experiment modes are not implemented. There is no Supabase integration.
