---
name: database
description: Implement or review the Quiniela persistence layer, including Drizzle schemas, PostgreSQL and Neon usage, migrations, repositories, constraints, indexes, and transactions.
---

# Database skill
Use for schema, Drizzle, PostgreSQL/Neon, migrations, repositories, constraints, indexes, and transactions.

Read first:
- `docs/specs/database-schema.md`
- relevant sections of `docs/specs/implementation-spec.md`

Rules:
- PostgreSQL is authoritative persistence; Neon is initial provider; Drizzle is ORM.
- Better Auth owns authentication identity tables.
- Persist source facts and explicit manual decisions; do not invent duplicated score/standing/debt sources of truth.
- Preserve historical Answers, Official Results, Payments, and audit records.
- Use transactions for business operations that must be atomic.
- Do not invent tables or schema semantics absent from the approved specs.
