# M7 — Standings & Winners

## Status

`COMPLETED — 2026-08-26`

## Goal

Aggregate derived scores into transparent League results and reusable ranking foundations without choosing unresolved ties arbitrarily.

## User-visible outcome

Users can view League standings and resolved Round/League winners; unresolved approved ties are shown for Admin decision.

## In scope

- Prediction Score aggregation and EXACT_SCORE breakdown.
- LEAGUE standings/winner and Round winner ordering.
- Reusable H2H standings calculation over supplied records, where applicable.
- Explicit manual resolution needed by these rankings, with audit.

## Out of scope

- H2H schedule/matchup persistence, groups, qualification, playoffs, payment bookkeeping, and final prize configuration.
- Persisted standings or winner snapshots as independent truth.

## Dependencies

M7 depends on:
- M6

## Relevant specifications

- `docs/product/product-spec.md` §3, §11, §16, §18
- `docs/specs/domain-model.md` LEAGUE, standings, prize-winner, and manual-resolution sections
- `docs/specs/database-schema.md` §14, §18–19, §24
- `docs/specs/application-use-cases.md` §10–13 and §18
- `docs/specs/implementation-spec.md` §6–7, §15–20, §22
- `docs/specs/testing-strategy.md`

## Relevant skills

- `domain-rules`
- `application`
- `database`
- `nextjs`
- `testing`

## Domain rules / invariants

- Prediction Score and H2H Points are distinct derived values.
- LEAGUE orders Prediction Score then EXACT_SCORE; remaining required ties are explicit Admin resolutions.
- H2H ordering is Points, Prediction Score, EXACT_SCORE, then wins.
- Round winner ordering is score, Match Question points, phase total, then earliest original submission.
- IDs, insertion order, creation time, and randomness never resolve unapproved ties.

## Application use cases

- `getLeagueStandings`
- `getH2HStandings` calculation foundation
- `getRoundWinner`
- `getLeagueWinner`
- Minimal explicit manual winner/tie resolution mutation required by these queries

## Persistence impact

Primarily derived queries over existing source facts. Add only approved explicit manual-decision persistence/audit needed for unresolved League/Round rankings. Do not add score or standings tables. Index changes require demonstrated query plans.

## Authorization

- Standings/winner visibility follows Competition access policy.
- Only Competition Admin may persist a manual resolution for that Competition.
- Cross-Competition decisions and participant-supplied winner identity are rejected.

## Deliverables

- Pure ranking/winner functions with explicit unresolved result type.
- Safe standings/winner queries and Admin resolution orchestration.
- Minimal decision/audit persistence if required.
- Mobile standings, winner, and unresolved-decision UI.
- Extensive ranking, query, authorization, and audit tests.

## Testing requirements

- Unit-test every ordering level, permutation determinism, no duplicate participants, and unresolved ties.
- Test League and Round winner criteria including original submission time.
- Integration-test source-based recomputation and manual-resolution audit.
- Verify Official Result correction changes derived standings.

## Acceptance criteria

- [x] League standings derive from current source facts.
- [x] EXACT_SCORE is the first League tiebreaker.
- [x] Round winner uses all approved criteria in order.
- [x] H2H calculation keeps Points distinct from Prediction Score.
- [x] Unresolved ties never choose an arbitrary participant.
- [x] Approved Admin decision is explicit and audited.
- [x] No score/standing/winner snapshot is introduced.
- [x] Relevant tests, lint, typecheck, and build pass.

## Definition of Done

- [x] Scope implemented.
- [x] Out-of-scope functionality was not introduced.
- [x] Approved domain rules preserved.
- [x] Authorization enforced server-side.
- [x] Relevant tests added.
- [x] No duplicated business logic.
- [x] No locked specification modified.
- [x] lint passes.
- [x] typecheck passes.
- [x] tests pass.
- [x] build passes.
- [x] milestone code review completed.

## Risks / implementation notes

Do not persist derived convenience columns. Design the unresolved-result shape for reuse by M9/M10 without building their features early.

Validation completed on 2026-08-26: formatting, lint, typecheck, 139 unit tests,
39 PostgreSQL integration tests, 2 mobile Chromium E2E tests, migration setup, diff
integrity, and the optimized Next.js webpack build passed. The default Turbopack build
cannot bind its internal sandbox process in this execution environment; the production
webpack build validates the application routes, including the new standings route.

## Open questions

Resolved during planning on 2026-08-26: Round phase totals stop at the target sequence;
submission ordering uses complete Answer-set time; current winners require effective
finalization; DRAFT Rounds block the current League winner; unresolved positions use
competition ranking; and Admin orders the full tied group. Manual decisions use normalized
append-only versions bound to the complete source revision, so every later source change
invalidates the decision without deleting its audit history.
