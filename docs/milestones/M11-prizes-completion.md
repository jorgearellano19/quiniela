# M11 — Prizes & Competition Completion

## Status

`COMPLETED — 2026-08-29`

## Goal

Complete every Competition type with final winner and configured-prize views, without processing money.

## User-visible outcome

Users see final Round, League/league-phase, and playoff winners with configured prize amounts, and completed Competition results remain available.

## In scope

- Complete the M8 `PrizeConfiguration` foundation with the remaining approved prize types/amounts.
- LEAGUE Round and League winner prizes.
- LEAGUE_PLAYOFFS Round winner, league-phase winner, and champion.
- GROUP_PLAYOFFS champion.
- Competition completion behavior and final result views.

## Out of scope

- Prize transfers, paid/unpaid prize state, online payments, settlement, accounting ledger, and new prize types.
- New winner/tiebreak rules.

## Dependencies

M11 depends on:
- M7
- M8
- M9
- M10

## Relevant specifications

- `docs/product/product-spec.md` §3–4, §14, §16, §18
- `docs/specs/domain-model.md` winner, champion, and Prizes sections
- `docs/specs/database-schema.md` §17–18, §24
- `docs/specs/application-use-cases.md` §12–17
- `docs/specs/implementation-spec.md` §19–22
- `docs/specs/testing-strategy.md`

## Relevant skills

- `domain-rules`
- `application`
- `database`
- `nextjs`
- `testing`

## Domain rules / invariants

- Allowed prize types depend on Competition type exactly as approved.
- Round and league-phase winners reuse approved derived ordering; playoff champion is the final matchup winner.
- Configured prize amount is separate from payments and has no transfer/status lifecycle.
- Unresolved winners require explicit Admin decision; no hidden ordering.
- Completion is an explicit Admin `STARTED → COMPLETED` action. It requires all applicable Rounds/phases effectively FINALIZED and the League winner or Playoff Champion resolved, then locks remaining configuration while preserving read-only history.

## Application use cases

- `configurePrize`
- `getPrizeWinner`
- `getRoundWinner`
- `getLeagueWinner`
- `getLeaguePhasePrizeWinner`
- `getPlayoffChampion`
- `completeCompetition` and completion-readiness query

## Persistence impact

Complete `PrizeConfiguration` with Competition/type uniqueness as required by configuration semantics, amount, UTC timestamps, and audit fields if sensitive configuration requires them. Winners remain derived/manual decisions already persisted; do not create payout or winner snapshot tables.

## Authorization

- Competition Admin configures allowed prizes and completes the Competition.
- Authorized Competition viewers may see configured winner/prize results.
- Reject invalid prize type, cross-Competition resource references, and non-Admin mutation.

## Deliverables

- Prize-type validation and completion invariants.
- Authorized configuration/completion and winner queries.
- Minimal prize migration/persistence.
- Admin prize configuration and final user result views.
- Domain, integration, authorization, and complete-competition E2E tests.

## Testing requirements

- Cover every Competition/prize-type matrix and each approved winner ordering.
- Verify configured amount display without payout state.
- Verify unresolved winner handling and correction-derived recomputation.
- E2E one complete usable path for LEAGUE, LEAGUE_PLAYOFFS, and GROUP_PLAYOFFS.

## Acceptance criteria

- [x] Only approved prize types can be configured per Competition type.
- [x] LEAGUE displays Round and final League winners/prizes.
- [x] LEAGUE_PLAYOFFS displays Round, league-phase, and champion winners/prizes.
- [x] GROUP_PLAYOFFS displays champion/prize.
- [x] Final results use derived facts and explicit manual decisions.
- [x] No payout, settlement, or prize-paid state exists.
- [x] All three Competition types reach a usable final state.
- [x] Admin completion rejects unfinished/correctable Rounds, unresolved required winners, and incomplete playoffs.
- [x] Relevant tests, lint, typecheck, and build pass.

## Definition of Done

- [x] Scope implemented.
- [x] Out-of-scope functionality was not introduced.
- [x] Approved domain rules preserved.
- [x] Authorization enforced server-side.
- [x] Relevant tests added.
- [x] No duplicated business logic.
- [x] Locked specifications changed only for the approved 2026-08-29 clarification.
- [x] lint passes.
- [x] typecheck passes.
- [x] tests pass.
- [x] build passes.
- [x] milestone code review completed.

## Completion record

Approved clarification recorded on 2026-08-29: financial features are optional,
prizes and fee/debt tracking are distinct, GROUP_PLAYOFFS may use a champion prize
without fees, configuration freezes at STARTED, and only configured secondary prizes
block completion.

Re-review on 2026-08-29 corrected DRAFT type changes that could retain unsupported
prizes, added initial prize-configuration audit events, completed the public financial and
completion DTO fields, removed the legacy single-prize reader, and expanded matrix,
authorization, transaction-source, and persistence regression coverage.

Final validation after re-review: migrations applied successfully; format, lint, and
TypeScript passed; 214 unit tests, 55 PostgreSQL integration tests, and 7 mobile Chromium
E2E flows passed. The production Next.js application compiled successfully with the
webpack builder; the sandbox cannot run Turbopack because its CSS worker cannot bind a
local port.

## Risks / implementation notes

Reuse established winner services/queries rather than implementing prize-specific ranking copies.

## Open questions

Whether `PrizeConfiguration` uses an upsert over unique `(competitionId, type)` is an implementation decision; the configuration must expose at most one effective amount per approved type.
