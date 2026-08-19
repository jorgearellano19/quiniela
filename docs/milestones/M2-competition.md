# M2 — Competition

## Status

`FUTURE`

## Goal

Enable an authenticated User to create and administer a Competition as the first complete business vertical slice.

## User-visible outcome

The creator can create a Competition, see it in “My Competitions,” open it, and edit configuration that is still allowed.

## In scope

- `createCompetition`, `updateCompetition`, list-my-Competitions query, and Competition detail query.
- Competition entity/configuration and lifecycle foundation needed by these operations.
- Structured rules summary data, optional Admin-authored rules note, immutable Competition currency (default `MXN`), and `DRAFT/STARTED/COMPLETED` lifecycle types.
- Creator's Competition-scoped Admin capability.
- Domain, persistence, Application, transport, mobile-first UI, and tests.

## Out of scope

- Participant invitation/join/approval, Competition start/completion, and creator participation.
- Rounds, questions, payments, prizes, scoring, groups, and playoffs.
- A global User role.

## Dependencies

M2 depends on:
- M0
- M1

## Relevant specifications

- `docs/product/product-spec.md` §2–4, §14, §17–19
- `docs/specs/domain-model.md` “Competition and Participant” and dependency direction
- `docs/specs/database-schema.md` §3–4, §20–23
- `docs/specs/application-use-cases.md` §3 and §5
- `docs/specs/implementation-spec.md` §3–18, §28–31
- `docs/specs/testing-strategy.md`

## Relevant skills

- `domain-rules`
- `application`
- `database`
- `nextjs`
- `testing`

## Domain rules / invariants

- Competition is the business/authorization boundary.
- Administration is a Competition-scoped capability, never a global User role.
- The creator becomes Admin; participation is independent.
- Competition starts DRAFT and locked configuration cannot be silently mutated after start.
- Currency is immutable after creation and money later uses integer minor units.

## Application use cases

- `createCompetition`
- `updateCompetition`
- A read-only list-my-Competitions query
- A read-only Competition detail query

## Persistence impact

Add approved `Competition` and minimal `CompetitionParticipant` membership needed to represent creator Admin capability, with foreign keys to Better Auth User, uniqueness/indexes from `database-schema.md`, UTC timestamps, and a transaction for Competition plus creator membership. Do not add later feature tables.

## Authorization

- Actor must be authenticated to create.
- Only a Competition Admin may update its editable configuration.
- A User must not view or mutate an unrelated Competition merely by supplying its ID.
- Creator Admin capability must be resolved from persisted Competition membership.

## Deliverables

- Framework-independent Competition invariants.
- Application-safe DTOs and use cases.
- Drizzle schema, migration, queries, and atomic creation.
- Thin Server Actions/routes and mobile-first create/list/detail/edit UI.
- Domain, persistence, application, and authorization tests.

## Testing requirements

- Unit-test type/configuration and lifecycle edit invariants.
- Integration-test uniqueness, foreign keys, and atomic creator membership.
- Cover anonymous, non-member, Admin, cross-Competition, and forged-ID cases.
- E2E the create → list → view path if E2E infrastructure is justified here.

## Acceptance criteria

- [ ] An authenticated User can create a valid Competition.
- [ ] Creation atomically establishes Competition-scoped Admin capability.
- [ ] The User sees only authorized Competitions in their list.
- [ ] Admin can view and edit allowed configuration.
- [ ] Non-Admin and cross-Competition mutations are rejected.
- [ ] No global role or future feature table is introduced.
- [ ] Relevant tests, lint, typecheck, and build pass.

## Definition of Done

- [ ] Scope implemented.
- [ ] Out-of-scope functionality was not introduced.
- [ ] Approved domain rules preserved.
- [ ] Authorization enforced server-side.
- [ ] Relevant tests added.
- [ ] No duplicated business logic.
- [ ] No locked specification modified.
- [ ] lint passes.
- [ ] typecheck passes.
- [ ] tests pass.
- [ ] build passes.
- [ ] milestone code review completed.

## Risks / implementation notes

Choose the application-wide product ID and Drizzle enum strategies during planning, as permitted implementation decisions. M3 owns the start transition after membership setup; M11 owns the explicit completion action and readiness validation.

## Open questions

None.
