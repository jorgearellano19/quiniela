# Quiniela Foundation

Technical foundation for the mobile-first Quiniela MVP: Next.js App Router, strict TypeScript, Better Auth, Drizzle, and PostgreSQL/Neon.

## Local setup

1. Use Node.js 22+ and pnpm 10.28.2.
2. Copy `.env.example` to `.env.local` and provide a development PostgreSQL URL and a random Better Auth secret of at least 32 characters.
3. Run `pnpm install`, `pnpm db:migrate`, then `pnpm dev`.

Use a separate database in `TEST_DATABASE_URL` for integration tests. Never point it to production.

## Validation

Run `pnpm check` for formatting, lint, type checking, unit tests, integration tests, and a production build. Integration tests are skipped locally when `TEST_DATABASE_URL` is absent; CI provisions an isolated PostgreSQL service, applies migrations, and executes them.

## Architecture

Presentation depends on Application, which depends on the framework-independent Domain. Infrastructure provides authentication and persistence. M0 contains only Better Auth's required tables—Competition and other product behavior belong to later milestones.

Read `AGENTS.md` before making changes. Approved documents under `docs/` are locked unless a specification revision is explicitly approved.
