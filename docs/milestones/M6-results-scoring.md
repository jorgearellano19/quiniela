# M6 — Official Results & Scoring

## Status

`FUTURE`

## Goal

Turn participant predictions and authoritative results into deterministic, auditable Prediction Scores.

## User-visible outcome

Admins can record/correct results within the approved window; participants see recalculated scores, and finalized results cannot change.

## In scope

- Record/correct Official Results; automatic finish/effective finalization; 24-hour correction window.
- Audit Official Result corrections.
- Pure scoring for `EXACT_SCORE`, `GOAL_DIFFERENCE`, `NORMAL_RESULT`, league-wide `CLOSEST_VALUE`, rival comparison, `OPTIONS`, `EXACT_VALUE`, manually judged `OPEN_TEXT`, and unanswered penalties.
- Question and Round score queries/breakdown needed to verify scoring.

## Out of scope

- Standings, H2H schedule/points, winners, payments, groups, and playoffs.
- Persisted score snapshots or external match/result APIs.

## Dependencies

M6 depends on:
- M4
- M5

## Relevant specifications

- `docs/product/product-spec.md` §5, §7–9, §11, §17–18
- `docs/specs/domain-model.md` scoring, lifecycle, results, and errors sections
- `docs/specs/database-schema.md` §8–9, §19, §22–24
- `docs/specs/application-use-cases.md` §9–10
- `docs/specs/implementation-spec.md` §6–7, §13–20, §30–31
- `docs/specs/testing-strategy.md`

## Relevant skills

- `domain-rules`
- `application`
- `database`
- `nextjs`
- `testing`

## Domain rules / invariants

- Match scoring is hierarchical and non-cumulative: exact, then enabled signed goal difference, then normal result.
- Goal difference preserves winner direction and excludes draws.
- Rival closest-value exact wins; equal non-zero distance awards neither.
- Without rival comparison, every eligible participant tied at the closest distance in the Round receives the point.
- OPTIONS uses one official correct option, EXACT_VALUE requires numeric equality, and OPEN_TEXT uses an auditable Admin correct/incorrect judgment.
- Unanswered is `-1` by default/configurable `0`; Tiebreaker unanswered is always `0`.
- The final required Result automatically sets FINISHED and begins exactly 24 hours; server-authoritative time makes the Round effectively FINALIZED at the boundary.
- Scores are derived and reflect corrections; results are separate from Answers.

## Application use cases

- `recordOfficialResult`
- `correctOfficialResult`
- `judgeOpenTextAnswer`
- Optional idempotent finalization materialization
- `getQuestionScore`
- `getPredictionScore`

## Persistence impact

Add `OfficialResult`, unique `questionId`, typed result fields, OPEN_TEXT Answer judgment facts, actor/timestamps, and minimum audit persistence approved during design. Use transactions for final-result automatic finish, correction/judgment plus audit, and optional idempotent finalization materialization. Add no score/standing snapshots.

## Authorization

- Competition Admin records/corrects/finalizes results in scope.
- Participants may read only score data allowed by product views, not mutate results.
- Reject anonymous, Participant-only, cross-Competition, outside-window, and finalized corrections.

## Deliverables

- Pure framework-independent scoring and lifecycle operations.
- Authorized result mutations and derived score queries.
- OfficialResult/audit migration and transaction-backed persistence.
- Focused Admin result UI and score display.
- Extensive domain tests plus integration, authorization, and critical-flow tests.

## Testing requirements

- Cover every mandatory scoring case in `testing-strategy.md`, including hierarchy non-stacking and signed direction.
- Test 24-hour boundaries and finalized immutability with injected time.
- Integration-test uniqueness, correction/audit atomicity, actor/time, and historical preservation.
- Complete the critical Round E2E through result, finish, correction, and score update.

## Acceptance criteria

- [ ] Admin can record each supported typed Official Result.
- [ ] Recording the final required Result atomically starts FINISHED.
- [ ] Corrections within 24 hours are audited and immediately reflected.
- [ ] Corrections at/after finalization are rejected.
- [ ] Effective finalization is enforced from server time without requiring an Admin action or worker.
- [ ] Every approved scoring rule and unanswered case is deterministic.
- [ ] Every submitted OPEN_TEXT Answer is judged before automatic FINISHED.
- [ ] Every equally closest non-rival participant receives the configured point.
- [ ] Higher match rules never stack with lower ones.
- [ ] No score snapshots are persisted.
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

Keep audit scope small but sufficient for actor, time, resource, action, and correction before/after. Rival scoring can be unit-tested now while actual H2H orchestration arrives in M9.

## Open questions

None.
