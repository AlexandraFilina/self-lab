# Self Lab

Personal habit experiments: record Done / Not done observations, optionally score built-in or custom metrics, and compare reported scores without claiming causation.

Stages 8A–8B use PostgreSQL and Better Auth email/password accounts. Each account has an isolated personal workspace. The existing visual system and pure domain/analytics rules are preserved. This remains a local development application; deployment and production email delivery are not configured.

## Local setup

Requires Node.js from [.nvmrc](.nvmrc), Docker Desktop with Compose, and Chrome for browser tests.

1. Copy [.env.example](.env.example) to `.env.local`.
2. Replace `CHANGE_ME` with a locally generated password in **all three places**: `POSTGRES_PASSWORD`, `DATABASE_URL`, and `TEST_DATABASE_URL`. For example, generate a hex password with `node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"`. Hex needs no URL escaping. Never commit the resulting file.
3. Generate a **different** high-entropy value for `BETTER_AUTH_SECRET` (at least 32 characters), set `BETTER_AUTH_URL=http://localhost:3000`, and keep the local SMTP settings.
4. Start development PostgreSQL/Mailpit, install dependencies, and apply migrations:

```bash
docker compose up -d --wait
npm ci
npm run db:migrate
npm run db:seed
npm run db:status
npm run dev
```

Open [localhost:3000/dashboard](http://localhost:3000/dashboard). Create an account at [/sign-up](http://localhost:3000/sign-up). Sign-up creates a user, a session, and an empty personal workspace; existing question-first onboarding follows. Use the same hostname as BETTER_AUTH_URL for auth forms and email links. Seed creates only an unowned development workspace; no account can access it through the application. Fictional experiments remain read-only fixtures and are never inserted into PostgreSQL.

Docker's CLI must be on PATH. On macOS, if Docker Desktop is running but `docker` is not found, enable its CLI tools installation or use `/Applications/Docker.app/Contents/Resources/bin/docker`.

```bash
docker compose ps
docker compose down
```

Development data persists in the named Docker volume across ordinary `down` / `up`. Do not remove the volume to apply a migration. PostgreSQL binds to localhost port 5432; the separate test service uses port 5433. Changing the password in the environment does not change an already initialized database user's password.

`npm run db:generate` generates a checked-in Drizzle migration after intentional schema changes. `db:migrate` applies pending migrations explicitly; the application never resets the database or automatically applies DDL. `db:seed` refuses production mode.

## Existing local data

Open the same browser and origin that held your old experiments. When valid user experiments exist under `self-lab:experiments`, a **Move your local experiments to your account** action appears. It imports only after you click it.

Supported local versions 1–5 are decoded without changing the original browser value. IDs, dates, entries, custom definitions, lifecycle history, and known save/edit timestamps are preserved; unknown timestamps remain null. Fictional samples are excluded. The destination is derived only from the current server session. Each account has separate import receipts. The import is transactional and stores a receipt so the same backup is not imported repeatedly, even after server-side edits. Conflicting existing IDs reject the entire batch; they never overwrite server data.

The browser copy remains an untouched backup. Corrupt/unsupported backups produce an explicit import error without blocking a healthy database workspace. Imports are limited to 100 experiments and a 2 MiB request; larger imports require a later explicit batching workflow. There is no browser-storage fallback after a failed server write.

## Architecture

```text
Authenticated user / ExperimentsProvider
  → ExperimentsRepository
  → HTTP adapter / Next.js Route Handlers
  → validated server session / owned workspace
  → server-only PostgreSQL repository
  → Drizzle / pg / PostgreSQL
```

- `src/app/api`: validated auth/account routes, protected experiment APIs, size bounds, and sanitized errors.
- `src/server/auth`: Better Auth configuration, session checks, personal workspace resolution, and local SMTP.
- `src/features/auth`: typed English auth/account forms, client, and shared Zod validation.
- `src/server/db`: typed normalized schema and server-only connection pool.
- `src/server/experiments`: scoped operations, transactions, and explicit domain mapping.
- `src/features/experiments/model`: existing types, Zod rules, lifecycle, and analytics.
- `src/features/experiments/data`: HTTP repository, explicit local import, legacy compatibility, and sample fixtures.
- `src/features/experiments/context`: post-mount loading, serialized operations, local calendar clock, and confirmed server results.
- `src/i18n`: typed English system copy; custom names remain user content.
- `drizzle`: reviewed SQL migration and generated migration metadata.
- `tests/integration`: real PostgreSQL repository tests.
- `tests/browser`: real headless Chrome through CDP, HTTP API, and test PostgreSQL.

The database uses separate Better Auth user/session/account/verification/rate-limit tables, owned workspaces, experiments, metric definitions, daily entries, metric values, extension history, and import receipts. A physical UNIQUE constraint on experiment/date prevents duplicate check-ins. `observed_date` is SQL DATE, while save/edit/completion instants are timestamptz. SQL values are parameterized; database credentials and the driver stay on the server.

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
npm run test:auth
npm run build
npm run test:browser
npm run test:browser:dev
```

Unit tests use Node's test runner with tsx. The PostgreSQL tests use a separate database whose name must end in `_test`; local hosts are required outside CI. Tests migrate that database, create random workspaces and unique auth accounts, and delete only their own rows, never development records.

Browser tests launch a real Chrome process with a temporary profile, send actual mouse/keyboard events, and start an isolated application server against unique accounts and personal workspaces in the test database. Production mode uses port 3101 and requires the build first. Development mode starts its own `next dev --webpack` in the ignored `.next-browser` build directory, including Strict Mode and instant navigation validation. Do not point browser tests at your ordinary development workspace; the previous external-server option is no longer used.

The scenario registers through real forms, checks server-side route protection and session reload, signs out/in, verifies email through Mailpit, resets a password through its emailed link, and checks User B cannot access User A’s experiment via either the page or HTTP GET/PUT/PATCH. It also checks mobile auth forms, creation/reload, a lost creation response with idempotent retry, empty metric validation, custom metric persistence, check-in/edit/reload without duplicates, dashboard counters, finish/results/reopen, explicit backup import, Today/Yesterday, expired-target extension, read-only samples, database save failure with retained input/retry, network retry, API validation, request-size/origin rejection, and mobile overflow. Direct queries confirm browser changes reached PostgreSQL. Console/runtime errors fail the test. Screenshot paths are printed. `SELF_LAB_CHROME_PATH` and `SELF_LAB_TEST_PORT` can override local executables/ports.

GitHub Actions uses disposable PostgreSQL and Mailpit services, generated test-only auth secrets, and unique accounts. Emails never leave the local SMTP capture service. It does not connect to a production database. A successful local run does not establish the status of a remote GitHub run.

## Manual review

1. Create an experiment with a built-in and custom metric; reload and check both persist.
2. Save Done today and Not done yesterday when eligible. Leave a score unrated; it must stay missing. Edit a saved date and confirm only one entry remains.
3. Create a second experiment: its blank form must be empty with no selected metrics. Check both Dashboard and Details entrypoints.
4. Finish, inspect separate metric results, reload, and reopen. An elapsed target stays Active until explicitly finished.
5. While signed in in the original browser, explicitly import local experiments; verify their dates, timestamps, custom metrics, and lifecycle. The original localStorage value must remain unchanged.
6. Stop only the development database with `docker compose stop postgres`, try a save, and verify an error with retained input. Restart with `docker compose up -d --wait postgres` and retry. No success should be shown before the server confirms.
7. Review at phone width; samples should be labelled fictional and offer no editing or lifecycle actions.

## Account, sessions, and local email

Routes: `/sign-up`, `/sign-in`, `/forgot-password`, `/reset-password`, and protected `/account`. Private app pages validate the session on the server, inside page-local Suspense boundaries compatible with Cache Components. APIs validate it independently for every operation. Authenticated visits to sign-in/sign-up redirect to Dashboard.

Better Auth handles all password hashing, tokens, cookie signing, sessions, and revocation. Sessions live in PostgreSQL and expire seven days after creation (fixed expiry, no rolling refresh or cookie cache). Cookies are HttpOnly, SameSite=Lax, and Secure in production mode. Browser closure preserves the persistent cookie until expiry. Sign-out revokes the server session; password reset revokes all sessions. Account transitions perform a full navigation to clear retained React Activity/provider state. No auth token or user ID is stored in localStorage.

Emails normalize to trimmed lowercase; passwords are never trimmed. Registration requires 12–128 characters and matching confirmation. There is no required display-name field. Login errors are generic; forgot-password gives the same confirmation for existing and missing accounts. Only the implemented auth endpoints are exposed; no OAuth, account deletion, or profile editing is enabled.

Mailpit runs locally at [localhost:8025](http://localhost:8025), SMTP port 1025. Open the email in Mailpit and follow its link. Reset links expire after 15 minutes and are single-use; verification links expire after one hour and are signed by Better Auth. Tokens are never shown by the application UI. Verification is available through signup mail and Account resend; unverified users can continue local development. Verification is not an authorization substitute.

The SMTP adapter accepts **loopback hosts only**. No external email provider is connected. Local background delivery avoids making forgot-password responses wait for SMTP; failures log a fixed diagnostic without message content/tokens. Mailpit must be running to receive mail; Account can resend verification. Production requires a real transport and durable background delivery before deployment.

The built-in auth rate limiter is enabled with PostgreSQL storage: 100 requests/minute overall, login 10/minute, signup 20/minute, reset requests and verification sends 5/minute per detected IP/path. Server session reads use the library’s server API and do not count as login attempts. Tests do not disable rate limiting; isolated DB tests use reserved test IPs. Trusted proxy/IP configuration and delivery abuse controls require review before any public deployment.

## Data ownership and migrations

Migration `0001` adds auth tables and nullable workspace owner/is-personal columns without reassigning Stage 8A rows. Personal workspaces have an owner FK and a partial unique index for one personal workspace per user. The same owner can have additional non-personal workspaces later; no team/shared-workspace UI exists.

Signup creates a personal workspace through the library's post-transaction user hook. If that provisioning step fails after account creation, the next authenticated repository request retries it idempotently. User/account/session signup records use the adapter transaction, while workspace provisioning is an idempotent follow-up, not a claim of cross-table signup atomicity. Requests resolve only the signed-in user's personal workspace; the browser cannot choose one. Missing and foreign experiment IDs both return 404.

Unowned development data stays untouched and inaccessible through normal accounts. No automatic account claim, database reset, or dev-to-user transfer is implemented. The old anonymous workspace environment flags are no longer used by application requests.

## Next stages

Stage 9 production work remains: deployment planning, managed PostgreSQL, TLS/secrets/backups, production mail transport and durable dispatch, email-verification policy, trusted proxy/IP configuration, operational monitoring, and retention/cleanup. None is configured by this stage. OAuth, teams, subscriptions, shared experiments, archive/delete, and additional scales are not implemented.
