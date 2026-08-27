# Testing Strategy — Quiniela MVP

**Status:** APPROVED AND LOCKED — revised 2026-08-19

## Purpose
Protect approved business rules and architectural boundaries with focused domain tests, targeted integration tests, and a small number of high-value E2E flows.

## Strategy
Prefer many focused domain tests + targeted application/integration tests + few high-value end-to-end tests. Test observable behavior and invariants, not implementation details or coverage percentage.

## Mandatory unit coverage
- Match scoring hierarchy: `EXACT_SCORE → GOAL_DIFFERENCE (if enabled) → NORMAL_RESULT`; lower-priority rules never stack after a higher rule succeeds.
- `GOAL_DIFFERENCE`: same winning side and signed `homeScore - awayScore`; draws never qualify; disabled mode does not award.
- `CLOSEST_VALUE`: ordinary league-wide mode, distance 0, every equal-closest participant receiving the point, and `againstRival` H2H behavior.
- `OPTIONS`, `EXACT_VALUE`, and auditable manual `OPEN_TEXT` correct/incorrect judgments.
- Unanswered penalties: default `-1`, configured `0`, and no fake Answer rows.
- Standings ordering: H2H Points DESC, Prediction Score DESC, EXACT_SCORE DESC, H2H wins DESC; unresolved ties require explicit Admin resolution.
- LEAGUE winner and EXACT_SCORE tiebreaker.
- GROUP_PLAYOFFS valid participant/group constraints and unresolved manual ties.
- LEAGUE_PLAYOFFS limits, no groups, and phase transition.
- H2H Round outcomes award 3/1/0 from opponent Prediction Scores; generated round robin covers every pairing once and handles odd-participant byes.
- Manual GROUP_PLAYOFFS assignment validation followed by complete within-group round-robin generation.
- Playoff configuration freeze, seeding, `BEST_SEED`, `TIEBREAKER_QUESTION`, bracket integrity, and champion determination.
- Round lifecycle `DRAFT → PUBLISHED → ACTIVE → FINISHED → FINALIZED` and invalid transitions.
- Official Result 24-hour correction boundary and immutability after FINALIZED.
- Answer deadlines, ownership, original `submittedAt`, payment restriction, and restoration.
- Invitation link authentication, rules-before-request, reuse/revocation/start expiry, pending request, and Admin approval.
- Competition start locks rules and invalidates invitations; voluntary leave is DRAFT-only; explicit Admin completion validates type-specific finalization/winner readiness and locks configuration.
- Automatic finish waits for every submitted OPEN_TEXT Answer judgment.
- Payments: obligations, partial/multiple payments, derived debt, threshold restriction/restoration, corrections, audit, eligible-only `CLOSEST_VALUE` comparison and `OPEN_TEXT` completeness, and the effective-FINALIZED restriction boundary.
- Round winner ordering: Prediction Score, Match Question points, competition-phase Prediction Score, earliest original submission.
- LEAGUE_PLAYOFFS prize ordering: Prediction Score, EXACT_SCORE, H2H, then Admin resolution.
- PlayoffRounds exercise the same Question, Answer, Official Result, deadline, correction, and effective-finalization rules as regular Rounds.
- Seeding pairs highest against lowest and `BEST_SEED` advances the better seed only after a tied PlayoffRound Prediction Score.

## Authorization coverage
Every mutation must cover anonymous rejection, Participant-only capabilities, Admin capabilities, Admin+Participant coexistence, cross-participant denial, and cross-Competition denial. Frontend visibility is never authorization.

Authentication-security coverage must verify least-privilege Platform Operator permissions, no implied Competition authority, active-operator targeting denial, suspension/session revocation, temporary-password expiry and forced replacement, audit redaction, and atomic persistent rate limits.

## Integration coverage
Verify important database constraints, foreign keys, historical preservation, and transaction atomicity for publishing, bracket generation, payments + audit, Official Result corrections + audit, and manual resolutions + audit.

## Audit coverage
Verify actor, timestamp, affected resource, action, and relevant decision/before-after data for sensitive administrative mutations.

## Property/invariant tests
Where practical, use property-based tests for deterministic scoring/ranking, no duplicate standings participants, monotonic debt reduction after payments, and playoff single-winner invariants.

## Test data
Use small factories/builders with sensible defaults and explicit overrides rather than giant static fixtures.

## Database tests
Use an isolated test database/schema. Never run tests against production Neon data. Apply migrations before integration tests and clean up deterministically. Local development provides Dockerized PostgreSQL with separate development/test databases. Critical database tests must fail with a clear setup error rather than be counted as passing when the test database is unavailable.

## Critical E2E flows

Authentication-security E2E coverage is explicitly deferred to M12. M1.1 uses unit, route/component, and PostgreSQL integration tests for the same security boundaries.
1. Competition setup: create → invite/join → approve.
2. Round: create → questions/scoring → publish → answers → official results → finish → standings/winner.
3. Payment: obligation → participant debt view → Admin payment → balance/restriction update.
4. Playoffs: phase completion → seeding → bracket → publish → resolve → champion.

## CI expectations
Before merge: format, lint, typecheck, unit tests, integration tests, build. Run relevant E2E where appropriate.

## Regression policy
Every production bug gets a regression test at the lowest appropriate layer. Codex must not weaken or delete tests merely to make a change pass.

## Final principle
**Test the rules that make the Quiniela correct, not every line of code that happens to implement them.**
