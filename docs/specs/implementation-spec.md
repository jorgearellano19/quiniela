# Implementation Specification — Quiniela MVP

**Status:** APPROVED AND LOCKED — revised 2026-08-19

## 1. Purpose

This document is the final implementation bridge between the approved product, architecture, database, domain, application, and testing documentation and the actual codebase.

It does not redefine business rules already approved elsewhere.

When a conflict exists, the approved domain/product documentation remains authoritative. This document defines how the codebase should be organized and implemented.

## 2. Source of truth

Implementation order of authority:

1. Approved product/business requirements.
2. Approved architecture documents.
3. `database-schema.md`.
4. `domain-model.md`.
5. `application-use-cases.md`.
6. `testing-strategy.md`.
7. This document.
8. Implementation details not covered above.

Codex must not invent a business rule when an approved document is silent. It should surface the ambiguity instead.

## 3. Core architecture

Use a simple layered architecture:

```text
Presentation
    ↓
Application
    ↓
Domain
    ↓
Infrastructure
    ↓
PostgreSQL / external services
```

The architecture intentionally has few layers. Each layer must have a clear responsibility and a protected boundary.

## 4. Recommended project structure

Use a feature-oriented structure while keeping the architectural boundaries explicit.

```text
src/
├── app/
├── components/
├── features/
│   ├── competitions/
│   ├── rounds/
│   ├── questions/
│   ├── answers/
│   ├── standings/
│   ├── playoffs/
│   ├── payments/
│   └── prizes/
├── domain/
│   ├── competition/
│   ├── round/
│   ├── scoring/
│   ├── standings/
│   ├── playoffs/
│   ├── payments/
│   └── prizes/
├── application/
│   ├── competitions/
│   ├── rounds/
│   ├── questions/
│   ├── answers/
│   ├── standings/
│   ├── playoffs/
│   ├── payments/
│   └── prizes/
├── infrastructure/
│   ├── db/
│   ├── repositories/
│   ├── auth/
│   └── audit/
├── lib/
│   ├── validation/
│   ├── errors/
│   └── time/
└── types/
```

Exact directory names may evolve, but dependency direction must not.

## 5. Dependency rules

Allowed:

```text
app/components/features
        ↓
application
        ↓
domain

application
        ↓
infrastructure

infrastructure
        ↓
database / external providers
```

Forbidden:

```text
domain → Next.js
Domain → React
domain → Drizzle
domain → Better Auth
domain → HTTP
domain → browser APIs

UI → direct database access
UI → direct repository access
UI → duplicated scoring rules
```

The Domain must remain executable in isolation.

## 6. Domain implementation

Domain code should contain:

- entities/value objects where useful;
- pure scoring functions;
- standings calculations;
- lifecycle validation;
- playoff advancement;
- payment/debt calculations;
- prize winner calculations;
- domain errors;
- domain invariants.

Prefer functions over unnecessary class hierarchies. Do not introduce patterns merely because they are fashionable.

## 7. Application implementation

Application use cases orchestrate:

```text
authenticate
→ authorize
→ load state
→ validate application preconditions
→ invoke domain
→ persist
→ audit
→ return safe result
```

Application code must not duplicate domain calculations.

## 8. Server Actions

Server Actions are transport/application entry points, not business-logic containers.

A Server Action should approximately do:

```text
parse input
→ establish session
→ call application use case
→ map errors
→ return result
```

Do not put scoring, standings, payment calculations, or lifecycle logic directly inside Server Actions.

All security checks must happen server-side.

## 9. Validation

Use schema validation at application boundaries.

Validate:
- external input shape;
- enums;
- required fields;
- numeric ranges;
- IDs;
- dates;
- competition-specific configuration.

Then let the Domain enforce business invariants.

Do not rely on TypeScript types alone for runtime input validation.

## 10. Authentication and authorization

Use Better Auth with the minimal approved implementation.

Authentication answers:

> Who is this User?

Application authorization answers:

> What may this User do in this Competition?

Never treat authentication as authorization.

Every Competition mutation must validate Competition-scoped permissions.

Better Auth owns the global `platform_operator` role and account suspension. Configure a custom least-privilege Admin-plugin access controller; never use its default full-power admin role. Application use cases own operator lookup, recovery, audit orchestration, and the rule that active operators cannot be targeted.

Browser credential submissions use Better Auth HTTP endpoints so request rate limiting applies. Store atomic counters in PostgreSQL, trust only deployment-controlled `x-real-ip`, and map HTTP 429 to safe retry feedback. Limits are sign-in 5/IP/minute, signup 3/IP/10 minutes, password change 5/IP/15 minutes, and temporary-password issuance 3/target/hour and 20/operator/hour.

A User may simultaneously be:

```text
Admin
Participant
```

These are capabilities, not mutually exclusive identities.

## 11. Database

Use PostgreSQL through the approved provider strategy:

```text
Neon
```

Supabase may be considered as an infrastructure alternative only if explicitly approved later.

Use Drizzle for persistence.

Development and integration testing must run against isolated Dockerized PostgreSQL without requiring Neon credentials. Provide a health-checked Compose service, separate development/test databases, migration/setup commands, safe local example environment values, and clean-checkout instructions. Critical database tests must not be reported as passing when they were skipped for lack of a local test database.

Database schema remains defined by `database-schema.md`.

Do not introduce database tables merely to mirror application classes.

Persistence should store the minimum authoritative state required by the approved MVP.

## 12. Repositories

Repositories belong to Infrastructure.

They should provide persistence operations needed by Application use cases.

Do not expose Drizzle query builders to Domain code.

Prefer interfaces at the application/infrastructure boundary where dependency inversion materially improves testability.

Do not create repository abstractions for every trivial query merely for theoretical purity.

## 13. Transactions

Use transactions for mutations that must be atomic.

Examples:

```text
publish Round
publish PlayoffRound
generate bracket
record Payment + Audit
correct Official Result + Audit
resolve manual tie + Audit
```

A transaction should represent a business operation, not an arbitrary collection of queries.

## 14. Time

Persist timestamps in UTC.

A Competition has no timezone.

User-facing timestamps are converted to the User's timezone at presentation/application boundaries.

Deadlines must be compared using server-authoritative time.

Do not use browser local time as the source of truth for authorization or deadline enforcement.

Publishing a regular Round or PlayoffRound opens its Questions until their individual deadlines. The final required Official Result automatically starts the 24-hour correction window. At `finishedAt + 24 hours`, server-authoritative reads and writes enforce effective finalization; no background worker or Admin action is required.

Every submitted OPEN_TEXT Answer must have an Admin judgment before the parent has all required Results. Competition completion is an explicit Admin-authorized `STARTED → COMPLETED` mutation with type-specific finalization and winner/champion readiness checks.

## 15. Errors

Use stable typed/domain error categories.

Examples:

```text
InvalidCompetitionState
UnauthorizedCompetitionAction
InvalidRoundTransition
QuestionNotEditable
RoundNotPublished
QuestionDeadlinePassed
AnswerNotEditable
ParticipantRestricted
OfficialResultImmutable
PlayoffRoundNotPublished
InvalidPlayoffConfiguration
UnresolvedTie
InvalidPayment
```

Application boundaries translate these into safe responses.

Never expose database errors or stack traces to clients.

## 16. Result DTOs

Do not expose persistence records directly to the UI by default.

Use application-safe result types such as:

```text
CompetitionSummary
ParticipantSummary
RoundSummary
QuestionSummary
AnswerSummary
StandingsRow
PaymentSummary
PrizeSummary
```

DTOs should represent what the caller needs, not reproduce the entire database row.

## 17. Feature implementation pattern

A feature should normally follow:

```text
Feature UI
    ↓
Server Action / route
    ↓
Application use case
    ↓
Domain operation
    ↓
Repository
    ↓
Database
```

For reads:

```text
UI
 ↓
query/use case
 ↓
repository
 ↓
database
```

Do not introduce unnecessary layers between these boundaries.

## 18. Read vs write behavior

Queries:
- must not mutate state;
- should return application-safe DTOs;
- should load only required data.

Mutations:
- require authentication;
- require Competition-scoped authorization;
- validate input;
- invoke domain rules;
- use transactions when necessary;
- audit required changes.

## 19. Derived data

For MVP, keep business-derived values conceptually derived:

```text
Prediction Score
H2H Points
Standings
Debt
Restriction status
Prize winners
Round winners
```

Persist only what is required as authoritative state.

If performance later demonstrates a need for materialized/cached values, introduce them deliberately with an explicit source-of-truth definition.

Do not prematurely create duplicated score columns that can become inconsistent.

## 20. Auditing

Audit mutations that affect historical or manually resolved decisions.

At minimum:

```text
Official Result corrections
Payment corrections
Participant removals
Manual tie resolutions
Seeding resolutions
Manual winner resolutions
```

Audit records should identify:
- actor;
- timestamp;
- affected resource;
- action;
- relevant decision/before-after information.

Audit data is historical and must not be casually deleted.

## 21. Payment implementation

Payment functionality is manual bookkeeping only.

The MVP must not contain:
- checkout;
- payment processor integration;
- wallet;
- payment links;
- automatic payment reconciliation.

The application tracks:
- obligations;
- recorded payments;
- outstanding balance;
- maximum debt;
- restriction eligibility;
- configured prizes.

When payment reduces debt to or below the configured threshold, eligibility is automatically restored.

Payments are participant-level contributions with no obligation allocation. Overpayment creates credit. A Competition has one immutable currency, defaulting to `MXN`; store money in integer minor units.

Payment restriction must never delete Answers.

## 22. Playoff implementation

Playoffs must preserve the approved distinction between:

```text
BEST_SEED
TIEBREAKER_QUESTION
```

PlayoffRound configuration remains editable until publication and frozen after publication.

PlayoffRounds own typed Questions and use the same participant Answer, shared Official Result, deadline, publication, automatic finish, correction-window, and effective-finalization implementation as regular Rounds. Reuse the scoring engine and shared application behavior rather than creating a parallel implementation.

Seeding must support:
- bracket-based seeding;
- ranking-based seeding.

Any unresolved tie requiring Admin intervention must be explicit and auditable.

Never resolve a business tie using database ID, insertion order, random selection, or hidden timestamp ordering unless an approved rule explicitly requires it.

## 23. Testing implementation

Every new business rule should be accompanied by a test.

Minimum order:

```text
Domain unit test
→ Application integration test when applicable
→ E2E only when the behavior crosses important user boundaries
```

Codex must not weaken or remove tests to make an implementation pass.

For a bug:

```text
bug
→ regression test
→ fix
```

## 24. Naming conventions

Use descriptive business names.

Prefer:

```text
calculatePredictionScore
publishRound
recordOfficialResult
getLeagueStandings
recordPayment
```

Avoid:

```text
processData
handleThing
doUpdate
manager
serviceHelper
```

Use domain terminology consistently. Do not rename approved concepts merely for stylistic preference.

## 25. TypeScript conventions

Prefer:
- strict TypeScript;
- explicit domain types;
- discriminated unions for typed business variants;
- exhaustive switches;
- immutable data where practical;
- small functions;
- explicit return types for important application/domain APIs.

Avoid:
- `any`;
- broad type assertions;
- nullable values when a domain type can model absence explicitly;
- giant generic utility abstractions.

## 26. React / frontend boundary

React components should:
- render state;
- collect user input;
- invoke application-facing actions/queries;
- display validation/errors.

Components must not calculate authoritative:
- Prediction Score;
- H2H Points;
- standings;
- playoff winners;
- debt;
- payment restrictions.

The UI may perform non-authoritative presentation calculations for UX, but the server remains authoritative.

The approved UI foundation is Tailwind CSS with source-owned shadcn/ui components added incrementally. Use semantic design tokens and mobile-first base styles. Prefer accessible shadcn primitives before custom interactive controls, but keep product visual design intentional rather than accepting registry defaults unchanged. Do not install the full component catalog upfront.

Server Components remain the default. Client Components are limited to interaction that requires browser state or event handling. Installable/offline PWA behavior is not required; mobile-responsive web is sufficient for MVP.

## 27. State management

Do not introduce React Query merely because it is popular.

Choose client-side server-state tooling only when actual requirements justify it.

For MVP, start with the simplest architecture compatible with:
- Server Components;
- Server Actions;
- route-level data loading;
- local client state where needed.

If caching, optimistic updates, polling, or complex client-side synchronization later justify React Query/TanStack Query, add it deliberately.

## 28. Security rules

Always assume client input is hostile.

Protect:
- Competition IDs;
- Participant IDs;
- Question IDs;
- Answer IDs;
- payment IDs;
- playoff IDs.

Authorization must be resolved from server-side identity and persisted relationships.

Never authorize based solely on hidden UI controls.

Avoid leaking:
- other participants' private information;
- internal error reasons;
- payment information outside the required Competition scope.

## 29. Performance principles

Prefer correctness first.

Optimize only after identifying a real bottleneck.

Initial priorities:
- efficient indexed queries;
- avoid obvious N+1 patterns;
- load only required fields;
- calculate derived data efficiently;
- use transactions appropriately.

Do not introduce event sourcing, CQRS, Redis, queues, or materialized scoring systems without demonstrated need.

## 30. Migration rules

Database changes must:
1. update schema definitions;
2. create migration;
3. update relevant persistence code;
4. update affected domain/application types if necessary;
5. update tests;
6. verify migration against an isolated database.

Never edit production data manually as part of normal application behavior.

## 31. Feature delivery workflow

For every feature:

### Step 1 — Read the approved specs

Identify:
- business rule;
- domain invariant;
- affected entities;
- application use case;
- required tests.

### Step 2 — Implement domain behavior

Write/update pure domain logic first.

### Step 3 — Add tests

Protect the rule before moving upward.

### Step 4 — Implement persistence

Add only required queries/mutations.

### Step 5 — Implement application use case

Authorize, load, invoke, persist, audit, return.

### Step 6 — Expose transport

Add Server Action/route only after application behavior works.

### Step 7 — Build UI

Connect UI to the application boundary.

### Step 8 — Run validation

```text
format
lint
typecheck
unit tests
integration tests
build
```

Run E2E for flows affected by the feature.

## 32. Codex operating rules

Codex should:
- read `AGENTS.md` first;
- read relevant skills before implementation;
- read only the specs relevant to the requested feature;
- identify dependencies before changing code;
- preserve approved business rules;
- prefer the smallest correct change;
- add tests for business behavior;
- avoid speculative abstractions;
- avoid unrelated refactors;
- report ambiguities instead of inventing requirements.

Codex should not:
- rewrite architecture without approval;
- create duplicate business rules;
- bypass authorization;
- weaken tests;
- introduce infrastructure unnecessarily;
- modify locked specifications.

## 33. Definition of Done

A feature is complete when:
- approved requirements are satisfied;
- domain rules are implemented;
- authorization is enforced server-side;
- persistence is correct;
- required audit behavior exists;
- relevant tests exist;
- lint passes;
- typecheck passes;
- tests pass;
- build passes;
- no unrelated regressions are introduced;
- no locked specification was changed.
- local database-dependent work is reproducible with Dockerized PostgreSQL when applicable.
- mobile UI uses the approved Tailwind/shadcn foundation and meets applicable accessibility behavior.

## 34. Change management

The approved specifications are the source of truth.

If implementation reveals a contradiction or missing business rule:

```text
STOP
→ identify ambiguity
→ ask for decision
→ update appropriate specification
→ update affected tests
→ resume implementation
```

Do not silently alter product behavior.

If a future approved change modifies a locked document, explicitly record that it is a specification revision rather than silently editing historical documentation.

## 35. MVP scope protection

Do not add features merely because the architecture can support them.

Explicitly out of MVP unless separately approved:
- online payments;
- payment processors;
- automatic prize transfers;
- survivor mode;
- automatic scoring from external match providers;
- complex notification infrastructure;
- unnecessary caching infrastructure;
- unnecessary event-driven architecture;
- speculative multi-tenant enterprise functionality.

## 36. Final implementation principle

The Quiniela MVP should be:

```text
simple
+
correct
+
strongly protected at boundaries
+
easy to test
+
easy to extend
```

The architecture should make future growth possible without forcing future complexity into the MVP.

**Build the smallest system that faithfully implements the approved domain.**
