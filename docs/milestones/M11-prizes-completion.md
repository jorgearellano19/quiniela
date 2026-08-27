# M11 — Prizes & Competition Completion

## Status

`FUTURE`

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

- [ ] Only approved prize types can be configured per Competition type.
- [ ] LEAGUE displays Round and final League winners/prizes.
- [ ] LEAGUE_PLAYOFFS displays Round, league-phase, and champion winners/prizes.
- [ ] GROUP_PLAYOFFS displays champion/prize.
- [ ] Final results use derived facts and explicit manual decisions.
- [ ] No payout, settlement, or prize-paid state exists.
- [ ] All three Competition types reach a usable final state.
- [ ] Admin completion rejects unfinished/correctable Rounds, unresolved required winners, and incomplete playoffs.
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

Reuse established winner services/queries rather than implementing prize-specific ranking copies.

## Open questions

Whether `PrizeConfiguration` uses an upsert over unique `(competitionId, type)` is an implementation decision; the configuration must expose at most one effective amount per approved type.
