# M10 — Playoffs

## Status

`FUTURE`

## Goal

Generate and progress valid playoffs from qualified participants to one official champion.

## User-visible outcome

Admins configure/publish PlayoffRounds and resolve matchups; participants see the bracket advance through the final without hidden tie decisions.

## In scope

- Bracket and ranking-based seeding.
- PlayoffRound/Matchup generation, round-specific scoring/tiebreaker/advancement configuration, and publication freeze.
- `BEST_SEED`, `TIEBREAKER_QUESTION`, advancement, explicit audited tie resolution, and champion.
- Both LEAGUE_PLAYOFFS and GROUP_PLAYOFFS entrants.

## Out of scope

- Regular H2H/group phase generation, payment tracking, prize payout, and new advancement modes.
- Automatic fallback tie resolution or answers before PlayoffRound publication.

## Dependencies

M10 depends on:
- M5
- M6
- M7
- M9

## Relevant specifications

- `docs/product/product-spec.md` §12–13
- `docs/specs/domain-model.md` Playoff Round, seeding, advancement, and errors sections
- `docs/specs/database-schema.md` §10–14, §20–24
- `docs/specs/application-use-cases.md` §14–15
- `docs/specs/implementation-spec.md` §13, §19, §22, §28–31
- `docs/specs/testing-strategy.md`

## Relevant skills

- `domain-rules`
- `application`
- `database`
- `nextjs`
- `testing`

## Domain rules / invariants

- Each PlayoffRound independently owns scoring rules, tiebreaker Question, and advancement mode; publication freezes all.
- All Matchups in one PlayoffRound share its tiebreaker Question; Answers require publication.
- Ranking seeding is Prediction Score, EXACT_SCORE, then explicit Admin resolution.
- `BEST_SEED` and `TIEBREAKER_QUESTION` remain distinct; remaining tie is manual.
- Every bracket has valid participant progression and exactly one final champion.

## Application use cases

- `configurePlayoffRound`
- `publishPlayoffRound`
- `generateSeeding`
- `generatePlayoffBracket`
- `resolvePlayoffMatchup`
- `resolvePlayoffTie`
- `getPlayoffChampion`

## Persistence impact

Add `PlayoffRound`, `PlayoffMatchup`, round-scoped scoring/tiebreaker references, specified uniqueness, FKs, UTC/audit fields, and explicit manual decisions. Publishing, bracket generation, advancement, and resolution+audit use transactions. Winners remain derived except explicit approved manual decisions/source matchup result.

## Authorization

- Competition Admin configures, publishes, generates, and manually resolves in scope.
- Participants may answer only as themselves after publication and view allowed bracket data.
- Reject cross-Competition seeds/questions/participants, unpublished Answers, non-Admin mutations, and invalid advancement.

## Deliverables

- Framework-independent seeding, bracket integrity, configuration freeze, and advancement logic.
- Authorized Playoff use cases and safe DTOs.
- Schema/migration, transactional persistence, and audit.
- Admin configuration/resolution and participant bracket/answer UI.
- Extensive domain/property, integration, authorization, audit, and playoff E2E tests.

## Testing requirements

- Cover freeze, both seeding modes, both advancement modes, shared tiebreaker, unpublished rejection, bracket integrity, and champion.
- Property-test one-winner/no-duplicate advancement invariants where practical.
- Integration-test unique positions, FK scope, generation atomicity, and manual resolution audit.
- E2E phase completion → seeding → bracket → publish → resolve → champion.

## Acceptance criteria

- [ ] Both approved seeding approaches produce a valid bracket.
- [ ] PlayoffRound configuration differs by round and freezes on publication.
- [ ] Unpublished PlayoffRounds cannot receive Answers.
- [ ] Both advancement modes resolve according to approved rules.
- [ ] Remaining ties require explicit audited Admin resolution.
- [ ] Progression produces exactly one champion.
- [ ] No automatic hidden tiebreaker is introduced.
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

Reuse M6 scoring through round-scoped configuration; do not create a second playoff scoring engine. Keep bracket writes atomic.

## Open questions

The specs name “bracket seeding” and “ranking-based seeding” but define ordering only for ranking-based seeding. Resolve bracket-seeding input/order and exact pairing layout before implementation. The approved meaning of `BEST_SEED` says better seed advances on the configured tie condition, but that condition/configuration is not fully specified.

