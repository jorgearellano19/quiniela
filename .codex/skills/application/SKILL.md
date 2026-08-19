---
name: application
description: Implement or review application use cases, Server Actions, competition-scoped authorization, DTOs, queries, mutations, and audit orchestration in the Quiniela repository.
---

# Application use-case skill
Use for Server Actions, application services/use cases, authorization, DTOs, mutations, queries, and auditing orchestration.

Read first:
- `docs/specs/application-use-cases.md`
- `docs/specs/domain-model.md`
- `docs/specs/implementation-spec.md`

Mutation flow:
`authenticate → authorize → load → validate → invoke domain → persist → audit → return safe result`

Rules:
- Authorization is Competition-scoped and server-side.
- Never trust a client-provided participant ID as identity/authorization.
- Server Actions are thin boundaries, not business-logic containers.
- Queries do not mutate domain state.
- Return application-safe DTOs rather than leaking persistence rows.
