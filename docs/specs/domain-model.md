# Domain Model — Quiniela MVP

**Status:** APPROVED AND LOCKED — revised 2026-08-26

## Purpose

Define the application domain independently from Next.js, React, Drizzle, Neon, Better Auth, HTTP, and UI concerns.

The domain owns entities, invariants, lifecycle rules, scoring, standings, playoff advancement, payment eligibility, prize winner determination, and explicit Admin resolutions. It must not know how data is stored or how requests reach the application.

Authentication identity may include the global `platform_operator` support role. This is not a Quiniela Competition role and can never imply Competition Admin or Participant capability. Temporary-password state, account suspension, sessions, and authentication-security audit records belong to the authentication/application boundary rather than the Competition domain.

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

A User has at most one membership row per Competition. The creator starts as `ADMIN + ACTIVE PARTICIPANT`. Admin capability is independent from participant status and survives leave/removal. Admin authorization is always Competition-scoped.

An Admin may create one reusable opaque invitation link for a DRAFT Competition. It can be revoked and otherwise expires when the Competition starts. An authenticated User opening the link must be shown the structured Competition configuration and optional Admin-authored rules note before submitting a join request. No row, `REJECTED`, or `REMOVED` becomes `PENDING`; repeated `PENDING` is idempotent; `ACTIVE` duplicates are rejected. Only Admin approval makes it `ACTIVE`. Merely viewing the rules is not a persisted acceptance gate in MVP.

Competition lifecycle for MVP includes explicit operations rather than unrestricted status assignment:

```text
DRAFT → STARTED → COMPLETED
```

Starting locks Competition rules and roster and invalidates the invitation link. It requires no pending requests and ACTIVE counts of at least 1 for LEAGUE, 2–30 for LEAGUE_PLAYOFFS, or exactly 8/16/32/64 for GROUP_PLAYOFFS. MVP does not require every Participant to record rule acceptance before start. Participants may voluntarily leave only in DRAFT; post-start departure is rejected. Admin removal is DRAFT-only, explicit and audited, and preserves historical records.

Completion is an explicit Admin action. LEAGUE requires every required Round to be effectively FINALIZED and the League winner resolved. LEAGUE_PLAYOFFS and GROUP_PLAYOFFS require every required regular/playoff phase to be effectively FINALIZED and the Playoff Champion resolved. COMPLETED locks remaining administrative configuration and retains read-only history.

## Round lifecycle

```text
DRAFT → PUBLISHED → ACTIVE → FINISHED → FINALIZED
```

**DRAFT:** Admin may add/edit Questions and scoring rules.

An Admin may create and edit a DRAFT Round while its Competition is DRAFT or STARTED.
Publishing requires the Competition to be STARTED. A COMPLETED Competition rejects all
Round mutations. Multiple Rounds may be ACTIVE at the same time.

**PUBLISHED:** Questions and scoring rules are frozen. The publish operation immediately and atomically continues to ACTIVE.

**ACTIVE:** Answers are accepted until each Question's deadline. MVP has no separate Admin activation action.

**FINISHED:** The last required Official Result has been recorded, which automatically finishes the Round and begins a 24-hour correction window.

**FINALIZED:** At `finishedAt + 24 hours`, server-authoritative time makes Official Results and historical scoring immutable. No background worker or Admin action is required for the rule to apply.

Do not expose a generic unrestricted `setStatus()` operation; transitions must be explicit and validated.

## Questions, Answers, and Official Results

`MATCH_SCORE` has distinct home/away labels and no prompt; all other types require a
prompt. A Competition owns typed scoring defaults. DRAFT Questions inherit the current
default or use an override. Publication snapshots effective scoring. Defaults may change
after STARTED for unpublished inheriting Questions only.

A Round owns `startsAt`, its default answer deadline. Each Question chooses the Round start
or a custom absolute deadline. Round and Question sequences define display order and use
mobile- and keyboard-accessible reorder controls while DRAFT.

A Question belongs to exactly one regular Round or PlayoffRound. M4 implements required
regular-Round ownership; M10 adds PlayoffRound ownership and the exclusive-parent
constraint. Question-specific data is typed. Approved MVP types are `MATCH_SCORE`,
`CLOSEST_VALUE`, `OPTIONS`, `OPEN_TEXT`, and `EXACT_VALUE`. Scoring belongs to each
Question; only the unanswered penalty belongs to the Round. Match Questions use numeric
`homeScore` and `awayScore`, not only strings. `OPTIONS` is single-select and owns multiple
configured options plus one official correct option. `EXACT_VALUE` uses numeric
Answer/Result values. `OPEN_TEXT` stores free text and an Admin's explicit correct/incorrect
judgment for each Answer.

An Answer belongs to `Participant + Question`. Only one active Answer exists for that
combination. Answers save individually and are not deleted back to unanswered. `submittedAt`
is the original submission time and must not reset when edited. The client may receive safe
capability information such as `canEdit`, but not internal reasons for non-editability.
`OPEN_TEXT` is trimmed, nonblank, and limited to 500 characters. Numeric Answers accept
signed `NUMERIC(18,6)` values and reject excess precision rather than rounding. Every
submitted `OPEN_TEXT` Answer requires an Admin correct/incorrect judgment before its parent
Round has all required Results and can automatically finish.

Payment restriction never deletes Answers.

Official Results are separate from participant Answers. For Match Questions, numeric
`homeScore` and `awayScore` are authoritative. Result entry and OPEN_TEXT judgment require
the affected Question deadline to have passed. Existing facts may be corrected while the
Round remains ACTIVE or during the FINISHED correction window; effective FINALIZED makes
them immutable. Every real correction is auditable.

OPEN_TEXT has no empty OfficialResult marker. Once closed, it is result-complete when all
submitted Answers are judged; no submitted Answers means it is complete.

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

Without `againstRival`, compare all eligible participant Answers in the applicable Round scope. Every participant tied at the closest distance receives the configured point.

With `againstRival = true`, compare H2H opponents.

```text
Official = 21
A = 24
B = 30
```

A wins because `|24 - 21| < |30 - 21|`.

If both have the same non-zero distance, neither gets the point. Distance `0` means the participant exactly predicted the official value and wins the point.

## Unanswered questions and Prediction Score

Unanswered penalties are configured scoring rules. MVP default is `-1`; Admin may
configure `0`. No other value is valid. Do not create fake Answers for unanswered
questions.

Prediction Score is derived from Answers, Official Results, Scoring Rules, and unanswered penalties. It is not an independent source of truth in MVP.

A partial Prediction Score includes only result-complete Questions. Unanswered penalties
begin contributing when the corresponding Question becomes result-complete.

H2H Points and Prediction Score are distinct.

## LEAGUE

LEAGUE has no H2H matchups, accumulates Prediction Score across Rounds, and determines the final winner by total Prediction Score.

MVP League tiebreaker #1:

```text
EXACT_SCORE points DESC
```

If approved criteria remain tied, use Admin resolution.

Live LEAGUE standings use competition ranking for unresolved groups (`1, 1, 3`). A
current League winner exists only with at least one Round, no DRAFT Round, and every
existing Round effectively FINALIZED. Competition completion later locks that winner.

## LEAGUE_PLAYOFFS

Two phases:

```text
Regular League Phase
        ↓
Playoffs
```

Regular phase:
- no groups;
- the persisted visible draw order feeds a partial circle-method schedule;
- maximum 30 participants;
- configurable 1 through N-1 Rounds and 2/4/8/16 qualifiers not exceeding the roster;
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

For each regular H2H Round, compare the two opponents' derived Prediction Scores for that Round:

```text
win  = 3 H2H Points
draw = 1 H2H Point each
loss = 0 H2H Points
```

The server securely shuffles once, persists and exposes the draw order, and generates the configured `LEAGUE_PLAYOFFS` schedule with the circle method. Retries reuse the persisted order. With an odd participant count, each schedule slot has one bye. A bye awards no H2H Points; against-rival CLOSEST_VALUE compares its participant with the exact arithmetic mean of other eligible Answers. For `GROUP_PLAYOFFS`, the Admin manually assigns valid group membership and the system generates the round-robin schedule within each group.

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

A PlayoffRound owns Questions, Answers, Official Results, scoring configuration, deadlines, lifecycle timestamps, and its `tiebreakerQuestionId`. All participants in the round answer the same Questions, all Matchups use the same Official Results and tiebreaker Question, and Answers remain participant-specific. Answers cannot exist for an unpublished PlayoffRound. Publication, deadline closure, automatic finish, the 24-hour correction window, and effective finalization follow the regular Round rules.

## Playoff seeding and advancement

Approved bracket seeding ranks:

```text
1. Prediction Score DESC
2. EXACT_SCORE DESC
3. Admin resolution if tied
```

Seeding orders Prediction Score DESC, then EXACT_SCORE DESC, then explicit Admin resolution. The official qualifier order is atomically snapshotted as immutable original seeds when the first bracket is generated. Every stage pairs the highest remaining original seed against the lowest remaining original seed (`1 vs 16`, `2 vs 15`, and so on).

With `BEST_SEED`, when the opponents' Playoff Round Prediction Scores tie, the better seed advances.

With `TIEBREAKER_QUESTION`, after tied PlayoffRound Prediction Scores, compare the opponents' derived points on the configured tiebreaker Question. Equal Question points require explicit Admin resolution. The domain must never silently choose a winner.

A FINISHED PlayoffRound exposes provisional winners during its correction window. Final advancement and downstream publication require the preceding round to be effectively FINALIZED. A manual playoff decision may be corrected only before a downstream PlayoffRound has been published.

The Playoff Champion is the participant who wins the final PlayoffMatchup.

## Round and League-phase prize winners

Round winner criteria:

```text
1. Prediction Score DESC
2. Match Question points DESC
3. Total Prediction Score in the League/competition phase through the target Round's sequence DESC
4. Earliest complete Answer-set submission
```

Criterion 4 uses the latest original `submittedAt` after every Question in the Round has an
Answer. An incomplete set ranks after a complete set and remains tied with another
incomplete set. A Round winner is stable only when every Round through the target sequence
is effectively FINALIZED. If still tied, Admin orders the complete tied group.

Manual ranking decisions are correctable, auditable, and bound to the complete
authoritative source revision. Any later source change invalidates the current decision
while preserving its history.

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

Financial features are optional and required for prizes. Fee/debt tracking remains
separate from prizes, and an enabled Competition may be prize-only. `GROUP_PLAYOFFS`
supports only its champion prize. All financial configuration freezes at `STARTED`.
Only prize types that are actually configured require a resolved secondary winner before
Competition completion.

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

Payments are participant-level contributions and are not allocated to individual obligations. Overpayment is allowed and yields a negative outstanding balance (credit). A Competition has one immutable currency, defaulting to `MXN`, and monetary amounts use integer minor units.

If a non-null `maximumDebt` satisfies `outstandingDebt > maximumDebt`, the participant is automatically restricted from open/future Rounds. Restricted Rounds contribute neither Answer points nor unanswered penalties, and their preserved Answers are read-only. The restriction does not delete Answers, alter finalized history, or transfer Competition ownership.

The open-Round restriction applies through the FINISHED correction window. Once the Round is effectively FINALIZED, preserved Answers participate in its finalized derived result regardless of current debt; subsequent balance changes cannot change that finalized result. No eligibility or score snapshot is persisted for this boundary.

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
publishPlayoffRound()
```

For MVP, publication opens Answers, complete required Results finish automatically, and elapsed server time finalizes effectively.

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
