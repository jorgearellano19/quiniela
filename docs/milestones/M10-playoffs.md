# M10 — Playoffs

## Status

`COMPLETED`

## Goal

Generate and progress valid playoffs from qualified participants to one official champion.

## User-visible outcome

Admins configure/publish PlayoffRounds and resolve matchups; participants see the bracket advance through the final without hidden tie decisions.

## In scope

- Ranking-based high-vs-low bracket seeding (`1 vs 16`, `2 vs 15`, and so on).
- PlayoffRound/Matchup generation; typed Questions, Answers, Official Results, deadlines, lifecycle; round-specific scoring/tiebreaker/advancement configuration; and publication freeze.
- `BEST_SEED`, `TIEBREAKER_QUESTION`, advancement, explicit audited tie resolution, and champion.
- Both LEAGUE_PLAYOFFS and GROUP_PLAYOFFS entrants.
- Entrants are accepted only from M9 `OFFICIAL` qualification: every regular-phase Round is effectively FINALIZED and required ranking ties are resolved.

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
- Each PlayoffRound owns the same five typed Question families and follows the regular Round publication, per-Question deadline, automatic finish, 24-hour correction, and effective-finalization rules.
- All participants answer the same Questions; all Matchups share Official Results and the tiebreaker Question; Answers are participant-specific and require publication.
- Ranking seeding is Prediction Score, EXACT_SCORE, then explicit Admin resolution.
- The first bracket atomically snapshots M9's derived `OFFICIAL` qualifier order as immutable numbered seeds; later qualifier-order corrections are rejected once that snapshot exists.
- Bracket pairing is highest remaining seed against lowest remaining seed.
- BEST_SEED applies only after opponents tie on their PlayoffRound Prediction Score; the lower-numbered/better seed advances.
- `BEST_SEED` and `TIEBREAKER_QUESTION` remain distinct; remaining tie is manual.
- Every bracket has valid participant progression and exactly one final champion.
- A FINISHED PlayoffRound exposes provisional winners during its correction window. The next PlayoffRound cannot publish or receive Answers until its predecessor is effectively FINALIZED and its advancement has been persisted.
- `TIEBREAKER_QUESTION` compares the opponents' derived points on the configured Question after their PlayoffRound Prediction Scores tie. Equal Question points remain unresolved.

## Application use cases

- `configurePlayoffRound`
- Shared create/update/remove Question behavior for an unpublished PlayoffRound
- `publishPlayoffRound`
- `submitAnswer`, `updateAnswer`, and `getMyAnswers` for published PlayoffRounds
- `recordOfficialResult`, `correctOfficialResult`, OPEN_TEXT judgment, score queries, automatic finish, and effective finalization for PlayoffRounds
- `generateSeeding`
- `generatePlayoffBracket`
- `resolvePlayoffMatchup`
- `resolvePlayoffTie`
- `getPlayoffChampion`

## Persistence impact

Add `PlayoffRound`, immutable numbered Playoff seeds, `PlayoffMatchup`, PlayoffRound-owned Question linkage, shared typed Answer/OfficialResult support, lifecycle timestamps, round-scoped scoring/tiebreaker references, specified uniqueness, FKs, UTC/audit fields, and explicit manual decisions. Publishing, final-result finish, correction, bracket generation, advancement, and resolution+audit use transactions. Winners remain derived except explicit approved manual decisions/source matchup result.

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

- Cover freeze, high-vs-low seeding, both advancement modes, shared tiebreaker, unpublished rejection, every typed Question/Answer/Result path, deadlines/correction/finalization, bracket integrity, and champion.
- Property-test one-winner/no-duplicate advancement invariants where practical.
- Integration-test unique positions, FK scope, generation atomicity, and manual resolution audit.
- E2E phase completion → seeding → bracket → publish → resolve → champion.

## Acceptance criteria

- [x] Ranking seeding orders Prediction Score, EXACT_SCORE, then Admin resolution and pairs highest against lowest.
- [x] PlayoffRound configuration differs by round and freezes on publication.
- [x] Unpublished PlayoffRounds cannot receive Answers.
- [x] Published PlayoffRounds support the same typed Questions, participant Answers, shared Official Results, deadlines, correction window, and effective finalization as regular Rounds.
- [x] Both advancement modes resolve according to approved rules.
- [x] Remaining ties require explicit audited Admin resolution.
- [x] Progression produces exactly one champion.
- [x] No automatic hidden tiebreaker is introduced.
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
- 189 domain/application unit tests passed across 29 files;
- 50 PostgreSQL integration tests passed across 11 files, including atomic bracket generation, all-manual advancement, correction-driven downstream rebuilding, authorization, and premature-champion prevention;
- 4 mobile Chromium E2E flows passed, including a 320 px playoff flow that configures the final, publishes both stages, advances the bracket, and confirms the champion;
- all four M10 migrations applied successfully to the local test database;
- the production webpack build passed; the default Turbopack build remains subject to the documented restricted worker-port environment failure.

## Risks / implementation notes

Reuse M4–M6 Question, Answer, Result, lifecycle, and scoring behavior through PlayoffRound ownership; do not create a second playoff engine. Keep bracket writes atomic and idempotent.

The closure review additionally verified matchup-scoped `CLOSEST_VALUE`, zero-penalty unanswered tiebreakers, exclusion of the tiebreaker from base Prediction Score, explicit advancement confirmation, correction-safe DRAFT successor rebuilding, contiguous round limits, and ACTIVE/Admin bracket visibility.

## Open questions

- Approved 2026-08-28: bracket generation rederives M9 qualification, accepts only `OFFICIAL`, and atomically snapshots/locks that order as numbered playoff seeds. FINISHED winners are provisional; downstream publication waits for effective FINALIZED. Tiebreaker advancement compares derived Question points.
