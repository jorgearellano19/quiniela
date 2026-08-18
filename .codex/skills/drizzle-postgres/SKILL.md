---
name: drizzle-postgres
description: Implement or review Drizzle ORM schemas, PostgreSQL queries, migrations, constraints, indexes, and transactions in this Quiniela repository. Use for changes involving drizzle.config.ts, src/infrastructure/db, or drizzle migrations; do not use it to invent product schema or business rules.
---

# Drizzle + PostgreSQL for Quiniela

Use Drizzle as the approved persistence implementation while keeping PostgreSQL authoritative and business rules in Domain/Application.

## Read before changing persistence

1. Read `AGENTS.md`.
2. Read the active milestone contract under `docs/milestones/`.
3. Read `docs/specs/database-schema.md` completely and the relevant sections of `docs/specs/implementation-spec.md`.
4. Inspect the existing Drizzle schema, migration journal, generated SQL, queries, and database tests.

If the requested schema semantics are missing, contradictory, or listed as an unresolved decision in the locked specs, stop and report the decision instead of choosing product behavior.

## Authority and boundaries

- `docs/specs/database-schema.md` defines product persistence. Do not invent tables, columns, roles, lifecycle states, audit semantics, or duplicated sources of truth.
- Better Auth owns its authentication tables. Competition membership and authorization are application-owned and must not use Better Auth Organizations or global User roles.
- Domain code must not import Drizzle, SQL, PostgreSQL, Better Auth, Next.js, or infrastructure types.
- Infrastructure may map persistence rows to application/domain data, but UI and Domain must never receive a Drizzle query builder.
- Persist source facts and explicit manual decisions. Prediction Score, H2H Points, standings, winners, debt, and restriction remain derived.

## Schema and migration workflow

For an approved database change:

1. Update only the required Drizzle schema definitions.
2. Add explicit foreign keys, uniqueness, nullability, checks, and indexes justified by the locked schema or demonstrated queries.
3. Persist timestamps as PostgreSQL `timestamp with time zone`; convert only at presentation boundaries.
4. Generate a migration with the repository's pinned command: `pnpm db:generate`.
5. Read the generated SQL and migration snapshot. Confirm it contains only the intended change and does not destructively rewrite historical data.
6. Apply migrations only to an explicit development or isolated test database with `pnpm db:migrate`. Never use a production Neon URL for tests.
7. Add or update integration tests for constraints, foreign keys, preservation, and transaction atomicity.
8. Run the milestone's focused checks and the repository validation baseline.

Do not use `drizzle-kit push` against shared or production databases. Do not manually modify production data as part of application behavior. Never claim a migration was applied or verified unless the command actually ran against the stated target.

## Query and transaction rules

- Load only fields required by the Application use case and return application-safe DTOs rather than raw rows.
- Parameterize values through Drizzle APIs. Use raw SQL only when Drizzle cannot express the required PostgreSQL behavior clearly, and keep it inside Infrastructure.
- Preserve historical Answers, Official Results, Payments, and audit records; do not introduce casual cascade deletion.
- Use one transaction for one atomic business operation, including publication, bracket generation, payment plus audit, Official Result correction plus audit, and manual resolution plus audit.
- Keep derived reads side-effect free. Recompute from authoritative facts unless an approved specification explicitly changes the source-of-truth model.
- Add indexes for approved uniqueness and demonstrated access paths. Review query plans before speculative performance indexes.

## Review checklist

- The migration matches the active milestone and locked schema.
- Dependency direction remains Presentation → Application → Domain, with Infrastructure providing persistence.
- Server-side authorization is performed before scoped mutations; database identifiers from the client are never authority.
- UTC timestamps, audit actor/time, uniqueness, and historical preservation are correct.
- No second ORM, cache, queue, score snapshot, debt column, or speculative repository abstraction was introduced.
- Unit/integration tests cover the invariant at the lowest useful layer, and migration SQL was reviewed.

When an installed Drizzle API is uncertain, verify against the pinned package types and current official Drizzle documentation rather than guessing or upgrading dependencies.
