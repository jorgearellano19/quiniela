# Quiniela Foundation

Technical foundation for the mobile-first Quiniela MVP: Next.js App Router, strict
TypeScript, Better Auth, Drizzle, PostgreSQL/Neon, Tailwind CSS, and source-owned
shadcn/ui components.

## Requirements

- Node.js 22 or newer.
- pnpm 10.28.2 through Corepack.
- Docker with Docker Compose v2.

## Local setup

From a clean checkout:

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev:local
```

`.env.local` is the source of truth for local database and authentication configuration.
It is ignored by Git; start from the safe values in `.env.example` and keep real secrets
out of the repository.

`dev:local` starts the health-checked PostgreSQL 17 service, applies the committed
migrations using `.env.local`, and starts the Next.js development server. Stop Next.js
with `Ctrl+C`; PostgreSQL remains available until you run `pnpm db:down`.

The command creates two separate local databases:

- `quiniela` for development;
- `quiniela_test` for integration tests.

The example connection strings are local-only. Never point `TEST_DATABASE_URL` at Neon or
any production database. Production secrets and Neon connection strings belong only in the
deployment environment.

## Local database commands

```bash
pnpm db:up             # start PostgreSQL and wait until it is healthy
pnpm db:setup          # start PostgreSQL and migrate both local databases
pnpm db:migrate:local  # migrate the development database
pnpm db:migrate:test   # migrate the test database
pnpm db:reset          # delete local database data, recreate, and migrate both
pnpm db:down           # stop PostgreSQL without deleting its volume
```

`db:reset` deletes only the Compose-managed `quiniela-foundation` PostgreSQL volume. It
does not connect to Neon.

## Validation

For a complete local validation from a clean database:

```bash
pnpm check:local
```

The individual commands are:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration:local
pnpm build
```

The required integration suite fails with setup guidance when `TEST_DATABASE_URL` is
absent; it is never reported as passing through a skip. `pnpm check` is the
environment-neutral CI command and expects its database and authentication variables to
already be configured.

CI independently provisions PostgreSQL, applies the same committed migrations, and runs
the complete validation sequence.

## Local platform operator

After creating a normal user through sign-up, grant or revoke local Platform Operator
access with an audited reason:

```bash
pnpm operator:grant --email operator@example.com --actor local-owner --reason "Initial operator"
pnpm operator:revoke --email operator@example.com --actor local-owner --reason "Access removed"
```

These package commands intentionally load `.env.local`. Production operator changes must
run with the production environment supplied explicitly; never copy local or test
credentials into a deployment.

## Architecture

Presentation depends on Application, which depends on the framework-independent Domain.
Infrastructure provides authentication and persistence. M0 contains only Better Auth's
required tables—Competition and other product behavior belong to later milestones.

The frontend uses these conventions:

- Server Components are the default; add a Client Component only when browser state or
  event handling requires one.
- Tailwind styles start mobile-first and use semantic tokens such as `background`,
  `foreground`, `primary`, and `muted`.
- shadcn/ui components are source-owned under `src/components/ui`; add only components
  required by an implemented feature.
- Prefer accessible shadcn/Radix primitives for interactive behavior. Keep authorization
  and business rules on the server.
- Do not install the full component catalog or duplicate product behavior in UI
  components.
- The current foundation uses the approved Radix Nova preset, neutral semantic tokens,
  system typography, and only the Card shell component.

Read `AGENTS.md` before making changes. Approved documents under `docs/` are locked unless
a specification revision is explicitly approved.
