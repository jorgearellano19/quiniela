# M0 — Foundation

## Status

`READY (REOPENED)`

## Goal

Provide a reproducible local and CI technical base on which vertical Quiniela features can be added safely.

## User-visible outcome

A minimal mobile-first landing page and Better Auth endpoint build successfully; no product workflow is exposed yet.

## In scope

- Next.js App Router and React foundation.
- Strict TypeScript, ESLint, Prettier, Vitest, and CI validation.
- Drizzle/PostgreSQL connection, migration runner, and Neon-compatible configuration.
- Docker Compose PostgreSQL with separate local development and test databases, health check, and deterministic setup/reset commands.
- Better Auth email/password foundation and owned identity tables.
- Server-only environment validation and safe application-error mapping.
- Tailwind CSS and source-owned shadcn/ui foundation with semantic design tokens and mobile-first conventions.

## Out of scope

- End-user sign-up/sign-in UI and protected pages.
- Competition authorization or any business-domain feature/table.
- Production deployment and E2E browser flows.
- Installable/offline PWA behavior and speculative UI component catalogs.

## Dependencies

None.

## Relevant specifications

- `docs/specs/database-schema.md`
- `docs/specs/implementation-spec.md`
- `docs/specs/testing-strategy.md`

## Relevant skills

- `nextjs`
- `database`
- `testing`

## Domain rules / invariants

- Better Auth owns identity tables; Competition membership remains separate.
- Server secrets and database access remain outside client code.
- No business-derived values or speculative infrastructure are persisted.

## Application use cases

None; product application use cases intentionally begin after M0.

## Persistence impact

Migration `drizzle/0000_past_shard.sql` creates Better Auth's `user`, `session`, `account`, and `verification` tables, with authentication constraints, indexes, and foreign keys. No product tables exist.

## Authorization

Authentication transport exists, but Competition-scoped authorization is intentionally absent.

## Deliverables

- Pinned dependencies and pnpm lockfile.
- App Router shell and `/api/auth/[...all]` handler.
- Auth-only Drizzle schema and migration.
- Environment and error foundations.
- Unit/integration test configuration and PostgreSQL-backed CI workflow.
- Health-checked local PostgreSQL Compose service; documented up/down/migrate/reset/test workflow from a clean checkout.
- Separate development/test connection examples that never target production Neon.
- Tailwind/shadcn project configuration, global semantic tokens, and only the minimal base components required for the application shell.
- Documented UI strategy: Server Components by default, Client Components for necessary interaction, mobile-first styling, accessible primitives, and incremental component installation.

## Testing requirements

- Environment parsing rejects invalid PostgreSQL configuration.
- Unknown errors map to a safe response.
- Isolated PostgreSQL integration verifies migrated auth tables.
- Local database tests run against the Dockerized test database and fail clearly if required setup is absent; they are not reported as passing when skipped.
- The local migration workflow succeeds from an empty development and test database.
- Format, lint, typecheck, tests, and build remain runnable.

## Acceptance criteria

- [x] Auth-only migration was generated.
- [x] Better Auth is wired through Infrastructure.
- [ ] Dockerized local development and test databases are available and documented.
- [ ] A clean checkout can start PostgreSQL, apply migrations, and run integration tests locally without Neon.
- [ ] Tailwind CSS and minimal shadcn/ui foundations are configured with semantic tokens.
- [ ] UI architecture and incremental component strategy are documented in the repository setup guidance.
- [ ] Unit and required integration tests pass without critical skips.
- [ ] lint and typecheck pass.
- [ ] production build passes.
- [x] CI provisions an isolated PostgreSQL database.

## Definition of Done

- [ ] Scope implemented.
- [x] Out-of-scope functionality was not introduced.
- [x] Approved domain rules preserved.
- [x] Authorization was not incorrectly modeled as global auth roles.
- [ ] Relevant tests added.
- [x] No duplicated business logic.
- [x] No locked specification modified.
- [ ] lint passes.
- [ ] typecheck passes.
- [ ] tests pass without critical database skips.
- [ ] build passes.
- [ ] milestone code review completed.

## Risks / implementation notes

The original M0 implementation allowed local integration tests to skip when `TEST_DATABASE_URL` was absent and provided no local PostgreSQL service. That made the completed status non-reproducible. The reopened work must preserve the existing CI service while adding an equivalent local workflow. Tailwind/shadcn is a source-owned component foundation, not authorization to install every registry component or duplicate domain behavior in UI code.

## Open questions

Exact shadcn visual preset, typography, and initial component list are implementation/design choices to approve during the M0 plan; they do not change product behavior.

## M0 REVIEW FINDINGS

The implemented dependency direction remains consistent with the approved architecture. M0 was reopened on 2026-08-19 because local PostgreSQL and the approved UI foundation were missing from its delivery contract and implementation.
