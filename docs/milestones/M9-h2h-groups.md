# M9 — H2H & Groups

## Status

`COMPLETED — 2026-08-28`

## Goal

Deliver the H2H regular phases for `LEAGUE_PLAYOFFS` and `GROUP_PLAYOFFS`, including qualification-ready rankings.

## User-visible outcome

Participants can view opponents, H2H outcomes, group/league-phase standings, and explicit qualification results; Admins resolve approved unresolved ties.

## In scope

- H2H matchups, 3/1/0 Points from Round Prediction Score, wins, and standings.
- `LEAGUE_PLAYOFFS` visible persisted draw and partial regular phase, max 30 and 1…`N-1` rounds, without groups.
- `GROUP_PLAYOFFS` manual Admin group assignment followed by system round-robin generation, 8/16/32/64 participant and size 4/8 constraints, one/two advancers, standings, and qualification.
- Explicit audited Admin resolution for unresolved group/H2H ties.

## Out of scope

- PlayoffRound/bracket generation, playoff advancement, champion, and prizes.
- Arbitrary/random/ID-based tie resolution or hidden pairing redraws.
- New Competition types.

## Dependencies

M9 depends on:
- M3
- M6
- M7

## Relevant specifications

- `docs/product/product-spec.md` §3, §8, §11, §13
- `docs/specs/domain-model.md` LEAGUE_PLAYOFFS, GROUP_PLAYOFFS, and H2H standings sections
- `docs/specs/database-schema.md` §12–14, §20–24
- `docs/specs/application-use-cases.md` §11, §14–15
- `docs/specs/implementation-spec.md` §19, §22, §28–31
- `docs/specs/testing-strategy.md`

## Relevant skills

- `domain-rules`
- `application`
- `database`
- `nextjs`
- `testing`

## Domain rules / invariants

- H2H Points and Prediction Score remain distinct.
- Higher Round Prediction Score wins the matchup for 3 H2H Points; a tie awards 1 each; a loss awards 0.
- H2H order is Points, Prediction Score, EXACT_SCORE, then wins; unresolved required ties are manual.
- LEAGUE_PLAYOFFS has no groups, max 30, 1…`N-1` configured regular rounds, and 2/4/8/16 qualifiers within the roster.
- The server securely shuffles once, persists the visible order, and applies the circle method; retries are idempotent and odd counts receive one bye per schedule slot.
- GROUP_PLAYOFFS counts are 8/16/32/64; groups are 4/8; one/two advance to fields 4/8/16/32.
- The Admin assigns valid group membership, then the system generates every within-group round-robin matchup.
- Group advancement uses the full H2H order before manual resolution and never uses hidden fallback ordering.

## Application use cases

- `configureLeaguePhase`
- `generateLeaguePhaseSchedule` and H2H matchup queries
- `configureGroups`
- `generateGroups`
- `getH2HPoints`
- `getH2HStandings`
- `getGroupStandings`
- `resolveGroupTie`

## Persistence impact

Add explicit H2H matchup/source-fact representation, including nullable opponent for a bye, plus `CompetitionGroup` and `CompetitionGroupParticipant`, constraints, indexes, and audited manual resolutions. H2H Points/standings remain derived. Schedule generation, group assignment/generation, and manual resolution plus audit must be transactional and idempotent where multi-write invariants require it.

## Authorization

- Competition Admin configures/generates structures and resolves ties.
- Authorized participants may view their Competition structures/results.
- Reject invalid Competition type, cross-Competition participants, forged matchups, and non-Admin mutations.

## Deliverables

- Pure H2H outcome, phase constraints, group qualification, and unresolved-decision behavior.
- Authorized configuration, generation, standings, and resolution use cases.
- Schema/migration, transactional generation, and audit persistence.
- H2H/group Admin and participant UI.
- Domain, property, integration, authorization, audit, and phase-flow tests.

## Testing requirements

- Cover all ordering criteria, points/wins distinction, no duplicates, and explicit unresolved states.
- Verify 3/1/0 outcome derivation, complete pair coverage, no duplicate pairings, and odd-count bye fairness.
- Cover type/count/size/advancement constraints and LEAGUE_PLAYOFFS no-group limits.
- Integration-test bracket-independent source facts, group membership integrity, generation atomicity, and audit.

## Acceptance criteria

- [x] Valid LEAGUE_PLAYOFFS regular phase produces H2H matchups without groups.
- [x] Valid GROUP_PLAYOFFS manual assignment produces approved-size groups and complete system-generated within-group schedules.
- [x] H2H Points/wins and standings derive correctly.
- [x] Approved participant counts and advancement fields are enforced.
- [x] Unresolved ties require an explicit audited Admin decision.
- [x] No arbitrary tie/pairing order or persisted standings is introduced.
- [x] Relevant tests, lint, typecheck, and build pass.

## Definition of Done

- [x] Scope implemented.
- [x] Out-of-scope functionality was not introduced.
- [x] Approved domain rules preserved.
- [x] Authorization enforced server-side.
- [x] Relevant tests added.
- [x] No duplicated business logic.
- [x] No sealed decision changed without approval.
- [x] lint passes.
- [x] typecheck passes.
- [x] tests pass.
- [x] build passes.
- [x] milestone code review completed.

## Closure validation

Validated 2026-08-28:

- formatting, lint, and TypeScript checks passed;
- 176 domain/application unit tests passed across 27 files;
- 44 PostgreSQL integration tests passed across 10 files;
- 3 mobile Chromium E2E flows passed, including the 320 px H2H Admin flow;
- the production webpack build passed;
- the default Turbopack build remains subject to the documented restricted worker-port environment failure and was verified with the approved webpack fallback.

## Risks / implementation notes

The H2H matchup schema must store schedule/source facts, not derived standings or Points. Select a deterministic circle-method implementation for round-robin generation and test its invariants rather than treating its internal ordering as product ranking.

## Open questions

- Approved 2026-08-27: partial LEAGUE_PLAYOFFS phase, persisted visible server-random draw, exact-average bye scoring, explicit matchup states, and official qualification readiness described in this revision.
