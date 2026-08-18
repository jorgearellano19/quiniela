# M9 — H2H & Groups

## Status

`FUTURE`

## Goal

Deliver the H2H regular phases for `LEAGUE_PLAYOFFS` and `GROUP_PLAYOFFS`, including qualification-ready rankings.

## User-visible outcome

Participants can view opponents, H2H outcomes, group/league-phase standings, and explicit qualification results; Admins resolve approved unresolved ties.

## In scope

- H2H matchups, Points, wins, and standings.
- `LEAGUE_PLAYOFFS` all-play-all regular phase, max 30 and rounds max `N-1`, without groups.
- `GROUP_PLAYOFFS` group creation/assignment, 8/16/32/64 participant and size 4/8 constraints, one/two advancers, standings, and qualification.
- Explicit audited Admin resolution for unresolved group/H2H ties.

## Out of scope

- PlayoffRound/bracket generation, playoff advancement, champion, and prizes.
- Arbitrary/random/ID-based pairing or tie resolution.
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
- H2H order is Points, Prediction Score, EXACT_SCORE, then wins; unresolved required ties are manual.
- LEAGUE_PLAYOFFS has no groups, max 30, all participants play, and at most `N-1` configured regular rounds.
- GROUP_PLAYOFFS counts are 8/16/32/64; groups are 4/8; one/two advance to fields 4/8/16/32.
- Group advancement starts with H2H Points and never uses hidden fallback ordering.

## Application use cases

- `configureLeaguePhase`
- H2H matchup generation/query operations required by that configuration
- `configureGroups`
- `generateGroups`
- `getH2HPoints`
- `getH2HStandings`
- `getGroupStandings`
- `resolveGroupTie`

## Persistence impact

Add the minimum approved H2H matchup/source-fact representation needed by standings, plus `CompetitionGroup` and `CompetitionGroupParticipant`, constraints, indexes, and audited manual resolutions. H2H Points/standings remain derived. Group generation and manual resolution plus audit must be transactional where multi-write invariants require it.

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
- Cover type/count/size/advancement constraints and LEAGUE_PLAYOFFS no-group limits.
- Integration-test bracket-independent source facts, group membership integrity, generation atomicity, and audit.

## Acceptance criteria

- [ ] Valid LEAGUE_PLAYOFFS regular phase produces H2H matchups without groups.
- [ ] Valid GROUP_PLAYOFFS configuration produces approved-size groups.
- [ ] H2H Points/wins and standings derive correctly.
- [ ] Approved participant counts and advancement fields are enforced.
- [ ] Unresolved ties require an explicit audited Admin decision.
- [ ] No arbitrary tie/pairing order or persisted standings is introduced.
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

The approved schema names group tables but does not name an H2H matchup table. Final persistence design must store source facts, not derived standings, and remain within approved semantics.

## Open questions

The specs refer to an “approved grouping method” and all-play-all H2H, but do not define group assignment/seeding or a concrete round-robin scheduling algorithm. Resolve deterministic assignment/scheduling policy before generation. Also clarify the difference between the general four-level H2H order and the product's GROUP_PLAYOFFS advancement statement that begins with H2H Points then manual resolution.

