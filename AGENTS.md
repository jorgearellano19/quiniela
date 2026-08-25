# AGENTS.md

## Purpose

This repository contains a mobile-first Quiniela application.

`AGENTS.md` defines how coding agents must work in this repository. Product behavior is
defined in `docs/product/`; technical design is defined in `docs/architecture/`.

## Source of truth

Before changing behavior, consult the relevant product and architecture documentation.

- `docs/product/` — approved product/business rules.
- `docs/architecture/` — approved technical architecture.
- `docs/product/product-design.md` — canonical UI, visual design, and product-content
  guidance.

Do not invent business rules when documentation already defines them. Do not silently
change sealed decisions. If a requested change conflicts with approved documentation,
identify the conflict and ask before implementing it.

Do not create new architecture/product documents unless explicitly requested.

## Architecture

Keep the dependency direction:

Presentation → Application → Domain

Infrastructure provides persistence and external integrations.

The Domain must not depend on Next.js, React, HTTP, PostgreSQL, Drizzle, Better Auth, or
hosting providers.

Business rules belong in Domain/Application, not React components or Server Actions.

Server Actions are application boundaries: validate input, authenticate, authorize, invoke
the use case, and return a safe result.

## Server authority

Never trust the client for authorization or business rules.

The server independently determines whether:

- an action is allowed;
- an Answer is editable;
- a Question is published;
- a Competition is in the correct lifecycle state;
- a Participant belongs to a Competition;
- a user is authorized for a Competition;
- a score is valid;
- a playoff transition is valid.

Do not expose internal editing-state reasons to the client.

## Authentication and authorization

Use Better Auth with a minimal implementation.

Authorization is contextual to a Competition. A User may administer one Competition,
participate in another, or administer and participate in the same Competition.

Do not model Competition administration as a global User role.

Never expose secrets, database credentials, or server-only environment variables to client
code.

## Database

PostgreSQL is the persistent source of truth. The initial provider is Neon.

Use Drizzle for schema, queries, and migrations. Do not introduce another ORM without
explicit approval.

Persist timestamps in UTC. A Competition has no timezone. Convert to the user's local
timezone only for presentation.

## Approved scoring rules

Match scoring is hierarchical, not cumulative:

1. `EXACT_SCORE`
2. `GOAL_DIFFERENCE` if enabled
3. `NORMAL_RESULT`

If `EXACT_SCORE` succeeds, do not also award lower-priority rules.

`GOAL_DIFFERENCE` uses signed `homeScore - awayScore` and must preserve result direction.
A draw does not qualify.

For `CLOSEST_VALUE + againstRival=true`, an exact prediction wins. If neither is exact and
both are equally distant, neither gets the point.

Unanswered penalties are `-1` by default and configurable to `0`. An unanswered Tiebreaker
Question always gives `0`.

## Scores and standings

Prediction Score and H2H Points are distinct.

MVP Prediction Scores are derived from Answers, Official Results, scoring rules, and
penalties. Do not introduce persisted score snapshots as a second source of truth without
approval.

League tiebreaker #1 is `EXACT_SCORE`.

H2H/Group standings tiebreak order:

1. H2H Points DESC
2. Prediction Score DESC
3. EXACT_SCORE DESC
4. More H2H wins

Unresolved ties that require human judgment are resolved manually by the administrator.
Never silently use database order, IDs, creation time, or randomness.

## Competition types

MVP supports:

- `LEAGUE` — no H2H; accumulated Prediction Scores determine the winner.
- `LEAGUE_PLAYOFFS` — all participants play H2H; max 30 participants; configurable
  regular-season rounds, max `N - 1`; then playoffs.
- `GROUP_PLAYOFFS` — participant counts 8/16/32/64; group sizes 4 or 8; one or two
  participants may advance per group.

`LEAGUE_PLAYOFFS` has no groups.

## Playoffs

Each Playoff Round may configure:

- Scoring Rules;
- Tiebreaker Question;
- Advancement Mode: `BEST_SEED` or `TIEBREAKER_QUESTION`.

These are editable while the round is unpublished and frozen once published.

All Matchups in one Playoff Round use the same Tiebreaker Question. Different rounds may
use different questions.

A Playoff Round cannot receive Answers before publication.

For ranking-based seeding:

1. Prediction Score DESC
2. EXACT_SCORE DESC
3. unresolved tie → administrator resolution

For GROUP_PLAYOFFS group standings:

1. H2H Points DESC
2. unresolved tie → administrator resolution

## Lifecycle

Competition/jornada lifecycle must respect the approved transitions.

For jornadas:

`DRAFT → PUBLISHED → ACTIVE → FINISHED → FINALIZED`

`PUBLISHED` freezes Questions and scoring rules.

`FINISHED` requires all required Official Results. It starts a 24-hour correction window.

During the 24-hour window, authorized administrators may edit Official Results. Affected
derived scores and standings must reflect the change.

After 24 hours, the jornada becomes `FINALIZED` and results are immutable.

## Manual resolution and auditability

Represent unresolved manual decisions explicitly.

Important administrative mutations must record `updatedAt` and `updatedBy`, especially
Official Result changes and manual tie resolutions.

Do not build a large audit-log system unless explicitly requested.

## Frontend

Mobile-first.

Before creating or modifying presentation, styling, or user-facing content, read and
follow `docs/product/product-design.md`. Product and business rules remain authoritative
whenever they conflict with a visual or content decision.

Prefer Server Components by default and Client Components only where interactivity
requires them.

Do not introduce React Query/TanStack Query unless a demonstrated requirement justifies
it.

Do not duplicate business rules in frontend code.

## Testing

When business logic changes, add or update tests, especially for:

- scoring;
- standings;
- H2H;
- playoffs;
- lifecycle;
- authorization;
- Answer editing.

Before completing work, run the applicable checks. Once configured, the standard baseline
is:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Run E2E tests for affected critical flows. Never claim a check passed unless it was
actually run.

## Dependencies and infrastructure

Do not add dependencies merely for convenience.

Prefer the simplest implementation that satisfies the approved requirements.

The MVP prioritizes free/low-cost managed infrastructure. Expected core infrastructure is
Next.js hosting + Neon + Better Auth + CI.

Do not introduce Redis, Kafka, RabbitMQ, Kubernetes, dedicated workers, or other
infrastructure without a demonstrated requirement.

## Working method

For non-trivial tasks:

1. Read the relevant product documentation.
2. Read the relevant architecture documentation.
3. Inspect existing code.
4. Identify affected Domain/Application/Infrastructure/Presentation areas.
5. Implement the smallest correct change.
6. Add/update tests.
7. Run validation.
8. Report changes, tests run, and any unresolved issues.

Do not rewrite unrelated code or perform broad refactors unless explicitly requested.

If behavior is ambiguous or conflicts with the approved documentation, stop and ask rather
than guessing.

## Avoid premature abstraction

Do not create speculative frameworks, generic repositories, factories, hooks, components,
or services without a demonstrated repeated need.

Build the MVP that is actually defined. Leave natural extension points, but do not
implement V2 features early.
