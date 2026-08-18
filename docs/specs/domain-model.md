# Domain Model — Quiniela MVP

**Status:** APPROVED AND LOCKED

## Purpose

Define the application domain independently from Next.js, React, Drizzle, Neon, Better Auth, HTTP, and UI concerns.

The domain owns entities, invariants, lifecycle rules, scoring, standings, playoff advancement, payment eligibility, prize winner determination, and explicit Admin resolutions. It must not know how data is stored or how requests reach the application.

## Core principles

- Competition is the primary business boundary.
- Authorization is Competition-scoped.
- A User may be both Admin and Participant in the same Competition.
- Prediction Scores, H2H Points, standings, winners, debt, and payment restriction are derived in MVP.
- Manual decisions that cannot be derived are explicit persisted decisions.
- UI state is never authoritative.
- Payment restrictions never delete Answers.

## Competition and Participant

Competition types:

```text
LEAGUE
LEAGUE_PLAYOFFS
GROUP_PLAYOFFS
```

A Competition owns participants, regular Rounds, scoring configuration, playoff stages where applicable, payment configuration, and prize configuration.

A Competition Participant represents a User's participation in a Competition. A participant may have both capabilities:

```text
ADMIN + PARTICIPANT
```

Suggested membership states:

```text
PENDING
ACTIVE
REJECTED
REMOVED
```

A User cannot have duplicate active participation in the same Competition. Admin authorization is always Competition-scoped.

## Round lifecycle

```text
DRAFT → PUBLISHED → ACTIVE → FINISHED → FINALIZED
```

**DRAFT:** Admin may add/edit Questions and scoring rules.

**PUBLISHED:** Questions and scoring rules are frozen.

**ACTIVE:** Answers may be submitted subject to deadlines and payment eligibility.

**FINISHED:** The last required Official Result has been recorded. A 24-hour correction window begins.

**FINALIZED:** Official Results and historical scoring are immutable.

Do not expose a generic unrestricted `setStatus()` operation; transitions must be explicit and validated.

## Questions, Answers, and Official Results

A Question belongs to exactly one Round. Question-specific data is typed. Match Questions use numeric `homeScore` and `awayScore`, not only strings.

An Answer belongs to `Participant + Question`. Only one active Answer exists for that combination. `submittedAt` is the original submission time and must not reset when edited. The client may receive safe capability information such as `canEdit`, but not internal reasons for non-editability.

Payment restriction never deletes Answers.

Official Results are separate from participant Answers. For Match Questions, numeric `homeScore` and `awayScore` are authoritative. Official Results can be corrected during the 24-hour correction window after FINISHED and become immutable after FINALIZED. Corrections must be auditable.

## Match scoring

Scoring is hierarchical:

```text
1. EXACT_SCORE
2. GOAL_DIFFERENCE, if enabled
3. NORMAL_RESULT
```

Only the highest successful rule awards points.

**EXACT_SCORE:** both home and away scores match exactly.

**GOAL_DIFFERENCE:** applies only to Home/Away victories and requires both the same winning side and the same signed home-minus-away goal difference.

```text
Official: Home 3 - 1 Away
Difference: +2

Prediction: Home 2 - 0 Away  → qualifies
Prediction: Home 0 - 2 Away  → does not qualify
```

A draw never qualifies as GOAL_DIFFERENCE.

**NORMAL_RESULT:** evaluated only when higher-priority scoring rules do not award points.

## CLOSEST_VALUE

Without `againstRival`, compare the participant's distance to the official value.

With `againstRival = true`, compare H2H opponents.

```text
Official = 21
A = 24
B = 30
```

A wins because `|24 - 21| < |30 - 21|`.

If both have the same non-zero distance, neither gets the point. Distance `0` means the participant exactly predicted the official value and wins the point.

## Unanswered questions and Prediction Score

Unanswered penalties are configured scoring rules. MVP default is `-1`, while Admin may configure `0` or another approved value. Do not create fake Answers for unanswered questions.

Prediction Score is derived from Answers, Official Results, Scoring Rules, and unanswered penalties. It is not an independent source of truth in MVP.

H2H Points and Prediction Score are distinct.

## LEAGUE

LEAGUE has no H2H matchups, accumulates Prediction Score across Rounds, and determines the final winner by total Prediction Score.

MVP League tiebreaker #1:

```text
EXACT_SCORE points DESC
```

If approved criteria remain tied, use Admin resolution.

## LEAGUE_PLAYOFFS

Two phases:

```text
Regular League Phase
        ↓
Playoffs
```

Regular phase:
- no groups;
- all participants play one another;
- maximum 30 participants;
- configurable number of Rounds;
- maximum `N - 1` Rounds.

After the regular phase, PlayoffRounds begin.

## GROUP_PLAYOFFS

Approved participant counts:

```text
8 / 16 / 32 / 64
```

Groups contain 4 or 8 participants.

Group ranking starts with H2H Points. If the approved H2H comparison remains tied, Admin resolves the tie. Never silently resolve using IDs, insertion order, timestamps, or randomness.

## H2H and Group standings

Ordering:

```text
1. H2H Points DESC
2. Prediction Score DESC
3. EXACT_SCORE DESC
4. More H2H wins
```

If approved criteria cannot uniquely resolve the ordering where manual resolution is required, Admin resolves it explicitly and the decision is audited.

## Playoff Round

Each PlayoffRound has independent configuration. Before publication Admin may edit:
- scoring rules;
- tiebreaker question;
- advancement mode.

After publication these are frozen.

Advancement modes:

```text
BEST_SEED
TIEBREAKER_QUESTION
```

A PlayoffRound owns its `tiebreakerQuestionId`. All Matchups in that PlayoffRound use the same tiebreaker Question. Answers cannot exist for an unpublished PlayoffRound.

## Playoff seeding and advancement

Two approved seeding options:
1. Bracket seeding.
2. Ranking-based seeding.

Ranking-based seeding:

```text
1. Prediction Score DESC
2. EXACT_SCORE DESC
3. Admin resolution if tied
```

With `BEST_SEED`, the better seed advances according to the configured playoff rule.

With `TIEBREAKER_QUESTION`, the configured PlayoffRound tiebreaker Question determines advancement. If it still produces an unresolved tie, Admin resolves it explicitly. The domain must never silently choose a winner.

The Playoff Champion is the participant who wins the final PlayoffMatchup.

## Round and League-phase prize winners

Round winner criteria:

```text
1. Prediction Score DESC
2. Match Question points DESC
3. Total Prediction Score in the League/competition phase DESC
4. Earliest submitted results
```

Criterion 4 uses original Answer submission timestamps. If still tied, Admin resolves.

LEAGUE_PLAYOFFS League-phase prize:

```text
1. Prediction Score DESC
2. EXACT_SCORE points DESC
3. H2H result between tied participants, when available
```

If still unresolved, use Admin resolution.

## Prizes

### LEAGUE
```text
ROUND_WINNER
LEAGUE_WINNER
```

### LEAGUE_PLAYOFFS
```text
ROUND_WINNER
LEAGUE_PHASE_WINNER
PLAYOFF_CHAMPION
```

### GROUP_PLAYOFFS
```text
PLAYOFF_CHAMPION
```

Admin configures each prize directly. The application tracks the winner and configured prize but does not process the actual prize payment.

## Payments and debt

Payment tracking is optional per Competition and manual only.

### LEAGUE
Optional payment per Round and winner prize.

### LEAGUE_PLAYOFFS
Optional payment per Round, League-phase winner prize, and Playoff Champion prize.

### GROUP_PLAYOFFS
Optional Playoff Champion prize.

No payment platform, checkout, wallet, or online payment flow exists in MVP.

Outstanding debt is derived:

```text
sum(payment obligations) - sum(recorded payments)
```

If `outstandingDebt > maximumDebt`, the participant may be restricted from open/future Rounds according to the approved payment rules. The restriction does not delete Answers, alter finalized history, or transfer Competition ownership.

When payment reduces debt to `outstandingDebt <= maximumDebt`, the participant automatically becomes eligible again.

## Domain services and operations

Prefer focused domain functions/services:

```text
ScoringService
StandingsService
PlayoffService
PaymentService
PrizeService
CompetitionLifecycleService
AnswerService
```

These are conceptual boundaries, not a requirement to create seven classes.

Pure calculations should remain framework-independent, for example:

```text
scoreMatchAnswer()
scoreClosestValue()
scoreClosestValueAgainstRival()
calculatePredictionScore()
calculateStandings()
calculateOutstandingBalance()
isParticipantRestricted()
```

They must not access database, session, HTTP, React, or Next.js.

Lifecycle operations should include explicit operations such as:

```text
publishRound()
activateRound()
finishRound()
finalizeRound()
publishPlayoffRound()
```

Payment operations:

```text
createPaymentObligation()
recordPayment()
calculateOutstandingBalance()
isParticipantRestricted()
```

Recording a payment automatically changes derived eligibility when the balance crosses the maximum-debt threshold.

Playoff operations:

```text
generateSeeds()
generatePlayoffMatchups()
resolvePlayoffMatchup()
advanceWinner()
```

## Domain errors

Use explicit stable categories, for example:

```text
InvalidCompetitionState
UnauthorizedCompetitionAction
InvalidRoundTransition
QuestionNotEditable
RoundNotPublished
QuestionDeadlinePassed
AnswerNotEditable
ParticipantRestricted
OfficialResultImmutable
PlayoffRoundNotPublished
InvalidPlayoffConfiguration
UnresolvedTie
InvalidPayment
```

Internal details should not be exposed directly to end users when they reveal information that should remain private.

## Domain invariants checklist

Every implementation change must preserve:

- Competition-scoped authorization.
- Admin + Participant coexistence.
- Round lifecycle.
- Publication freezes Questions and scoring.
- Playoff publication freezes PlayoffRound configuration.
- Unpublished PlayoffRounds cannot receive Answers.
- Official Results are separate from Answers.
- FINALIZED Results cannot change.
- Match scoring hierarchy.
- Correct GOAL_DIFFERENCE direction.
- `againstRival` behavior.
- Unanswered penalties.
- H2H ≠ Prediction Score.
- GROUP_PLAYOFFS participant/group constraints.
- LEAGUE_PLAYOFFS has no groups.
- Payment restrictions do not delete Answers.
- Payment restores eligibility automatically.
- Prize tracking does not become a payment platform.
- Manual tie resolutions are explicit and auditable.
- Admin ownership is never transferred by participant/payment state.

## Dependency direction

```text
UI
 ↓
Application / Server Actions
 ↓
Domain
 ↓
Persistence Adapter
 ↓
PostgreSQL
```

The Domain must not depend on the layers above it.

When implementing a feature, first identify the domain invariant or business rule it changes, then place the behavior at the narrowest appropriate layer.

## Acceptance criteria

Ready for implementation when entities are infrastructure-independent, lifecycle transitions are explicit, scoring is deterministic, standings have explicit ordering rules, playoff advancement is explicit, payment eligibility is derived, manual decisions are explicit, Admin and Participant capabilities coexist, and no domain rule requires UI state to be correct.

## Final principle

**The domain should make invalid product states difficult to represent and valid product behavior deterministic.**
