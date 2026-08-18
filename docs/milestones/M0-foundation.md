# M0 — Foundation

## Status

`COMPLETED`

## Goal

Provide a buildable, testable technical base on which vertical Quiniela features can be added safely.

## User-visible outcome

A minimal mobile-first landing page and Better Auth endpoint build successfully; no product workflow is exposed yet.

## In scope

- Next.js App Router and React foundation.
- Strict TypeScript, ESLint, Prettier, Vitest, and CI validation.
- Drizzle/PostgreSQL connection, migration runner, and Neon-compatible configuration.
- Better Auth email/password foundation and owned identity tables.
- Server-only environment validation and safe application-error mapping.

## Out of scope

- End-user sign-up/sign-in UI and protected pages.
- Competition authorization or any business-domain feature/table.
- Production deployment and E2E browser flows.

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

## Testing requirements

- Environment parsing rejects invalid PostgreSQL configuration.
- Unknown errors map to a safe response.
- Isolated PostgreSQL integration verifies migrated auth tables.
- Format, lint, typecheck, tests, and build remain runnable.

## Acceptance criteria

- [x] Auth-only migration was generated.
- [x] Better Auth is wired through Infrastructure.
- [x] Unit tests pass.
- [x] lint and typecheck pass.
- [x] production build passes.
- [x] CI provisions an isolated PostgreSQL database.

## Definition of Done

- [x] Scope implemented.
- [x] Out-of-scope functionality was not introduced.
- [x] Approved domain rules preserved.
- [x] Authorization was not incorrectly modeled as global auth roles.
- [x] Relevant tests added.
- [x] No duplicated business logic.
- [x] No locked specification modified.
- [x] lint passes.
- [x] typecheck passes.
- [x] unit tests pass.
- [x] build passes.
- [x] milestone code review completed.

## Risks / implementation notes

Local integration tests skip when `TEST_DATABASE_URL` is absent; CI applies migrations and runs them against isolated PostgreSQL. `pnpm check` does not itself apply migrations, so a fresh integration environment must run `pnpm db:migrate` first.

## Open questions

None.

## M0 REVIEW FINDINGS

The implemented dependency direction is consistent with the approved architecture. Application and Domain modules do not yet exist because no product behavior exists. No serious architecture violation was found.

