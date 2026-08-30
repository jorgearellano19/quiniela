# Database Schema — Quiniela MVP

**Status:** APPROVED AND LOCKED — revised 2026-08-26
**Provider:** Neon PostgreSQL  
**ORM:** Drizzle

## 1. Principles

- PostgreSQL is the authoritative persistence layer.
- Use explicit relational modeling and foreign keys.
- Keep domain rules out of persistence code.
- Persist source facts; derive Prediction Scores, standings, winners, debt, and restrictions.
- Store timestamps in UTC; presentation converts them to the user's timezone.
- Better Auth owns authentication identity tables.
- Better Auth also owns the global platform role, suspension, temporary-password state, sessions, and rate-limit counters approved in M1.1.
- Competition membership is separate from global User identity.
- The same User may be Admin and Participant in the same Competition.
- MVP has manual payment tracking only; no external payment provider.

## 2. Core relationship model

Authentication security extends Better Auth User with role, ban, and temporary-password fields; extends Session with the Admin-plugin field; and adds Better Auth's `rate_limit` table. A focused append-only `auth_security_event` records actor, target, action, reason/verification method, and UTC time without credentials, tokens, hashes, or raw IP addresses.

```text
Better Auth User
      │
      ▼
CompetitionParticipant
      │
      └────────────── Competition
                       ├── Round
                       │    ├── Question
                       │    │    └── Answer
                       │    └── OfficialResult
                       ├── PlayoffRound
                       │    └── PlayoffMatchup
                       ├── CompetitionGroup
                       │    └── GroupParticipant
                       ├── PaymentObligation
                       └── PrizeConfiguration
```

## 3. Competition

Suggested fields:

```text
Competition
├── id
├── name
├── type
├── status
├── financialFeaturesEnabled
├── roundFeeAmount
├── maximumDebt
├── currency
├── rulesNote
├── invitationTokenHash
├── invitationInvalidatedAt
├── startedAt
├── completedAt
├── createdByUserId
├── createdAt
└── updatedAt
```

Types:

```text
LEAGUE
LEAGUE_PLAYOFFS
GROUP_PLAYOFFS
```

`roundFeeAmount` is a positive integer-minor-unit amount when payments are enabled. `maximumDebt` is nullable when no restriction is configured. Payment configuration is DRAFT-only and frozen at Competition start. Do not create payment obligations when payments are disabled.

Competition lifecycle is `DRAFT → STARTED → COMPLETED`. Starting locks Competition rules and invalidates the reusable invitation token. Completion is an explicit Admin action after type-specific finalization/winner readiness and locks remaining configuration. Store only a secure hash of the opaque token. `currency` is immutable after creation, defaults to `MXN`, and all money uses integer minor units.

## 4. CompetitionParticipant

```text
CompetitionParticipant
├── id
├── competitionId
├── userId
├── role/capabilities
├── status
├── requestedAt
├── approvedAt
├── statusChangedAt
├── updatedByUserId
├── createdAt
└── updatedAt
```

The model must support Admin + Participant simultaneously. Do not use a mutually exclusive global User role.

Suggested membership states:

```text
PENDING
ACTIVE
REJECTED
REMOVED
```

Enforce exactly one reusable membership row per User + Competition. Creator rows are backfilled to `ACTIVE` with creator attribution.

Opening a valid invitation link requires authentication and shows rules before a join request creates or restores `PENDING`. Admin approval changes it to `ACTIVE`. Reuse the same membership row for rejection, removal, and a later request; do not create duplicate User + Competition rows.

Append `CompetitionParticipantEvent` rows for each real `REQUESTED`, `APPROVED`, `REJECTED`, `REMOVED`, or `LEFT` transition with membership, actor, previous/next status, and UTC timestamp. Idempotent retries create no event.

## 5. Round

```text
Round
├── id
├── competitionId
├── sequence
├── name
├── startsAt
├── status
├── publishedAt
├── finishedAt
├── finalizedAt
├── createdAt
└── updatedAt
```

`(competitionId, sequence)` is unique.
Trimmed, case-insensitive Round names are also unique within a Competition.

Lifecycle:

```text
DRAFT → PUBLISHED → ACTIVE → FINISHED → FINALIZED
```

- DRAFT: Questions and scoring rules editable.
- PUBLISHED: Questions and scoring rules frozen.
- ACTIVE: Answers may be submitted subject to deadlines/restrictions.
- FINISHED: 24-hour Official Result correction window.
- FINALIZED: Official Results immutable.

Publication atomically records `publishedAt`, freezes configuration, and advances through PUBLISHED to ACTIVE so Answers open without a separate activation mutation. Complete required Official Results set `finishedAt` and FINISHED atomically. Effective finalization is derived from server time at `finishedAt + 24 hours`; `finalizedAt` may be materialized idempotently but cannot be the authority that extends the correction window.

## 6. Question

Competition stores explicit typed scoring defaults for every Question family. Defaults
remain editable through STARTED and freeze at COMPLETED. DRAFT Questions may inherit
current values; publication snapshots effective values into Question scoring.

```text
Question
├── id
├── roundId (required in M4; nullable when M10 adds PlayoffRound ownership)
├── playoffRoundId (nullable)
├── sequence
├── type
├── prompt
├── deadlineMode (`ROUND_START` or `CUSTOM`)
├── deadlineAt (nullable custom value)
├── usesDefaultScoring
├── createdAt
└── updatedAt
```

M4 requires `roundId` and implements regular-Round ownership only. M10 adds nullable
`playoffRoundId`, makes `roundId` nullable, and adds the exactly-one-parent constraint when
PlayoffRound exists. Sequence is unique within the selected parent.

Approved types are `MATCH_SCORE`, `CLOSEST_VALUE`, `OPTIONS`, `OPEN_TEXT`, and `EXACT_VALUE`. Do not create one giant JSON structure for all question types. Use typed columns or type-specific tables where appropriate. `OPTIONS` needs ordered option rows and one official correct option. `OPEN_TEXT` needs an explicit per-Answer Admin judgment. `CLOSEST_VALUE` and `EXACT_VALUE` use numeric typed values.

Typed closest/exact Answer and Result values use `NUMERIC(18,6)`. Match scores are integers
from 0 through 999. M4 locks these future boundaries but adds no Answer or Official Result
columns.

For Match Questions, scores are numeric `homeScore` and `awayScore`, never only a string such as `"3-1"`.

## 7. Answer

```text
Answer
├── id
├── questionId
├── participantId
├── homeScore / awayScore
├── numericValue
├── optionId
├── textValue
├── submittedAt
├── updatedAt
└── exactly one valid typed value shape
```

`(questionId, participantId)` is unique.

- Preserve original `submittedAt`; editing must not reset it.
- Match scores are integers from 0 through 999. Numeric values use signed `NUMERIC(18,6)`.
- OPEN_TEXT is trimmed, nonblank, and limited to 500 characters.
- The selected OPTIONS value must belong to the Answer's Question.
- The client must not expose internal reasons why an Answer is no longer editable.
- Payment restriction never deletes Answers.
- When payment restores eligibility, stored Answers can count again.

## 8. OfficialResult

Official Results are separate from Answers.

```text
OfficialResult
├── id
├── questionId
├── homeScore
├── awayScore
├── recordedAt
├── updatedAt
└── updatedByUserId
```

`questionId` is unique.

For Match Questions, `homeScore` and `awayScore` are numeric.

Official Results may be corrected during the 24-hour window after the Round enters FINISHED. After FINALIZED, corrections are rejected. Administrative corrections must be auditable.

Initial entry requires the Question deadline to have passed. Existing Results may also be
corrected while the parent Round remains ACTIVE; effective finalization is always the
immutability boundary.

For `OPEN_TEXT`, persist the Admin's explicit correct/incorrect judgment per Answer with actor and timestamps; this is a source fact, not a derived score. Regular and PlayoffRound Results share the same correction rules.

Do not create an empty OfficialResult row for OPEN_TEXT. A closed OPEN_TEXT Question with
no submitted Answers is result-complete; otherwise every submitted Answer requires its
judgment.

All submitted `OPEN_TEXT` Answers must have judgments before the parent can atomically enter FINISHED.

## 9. Scoring configuration

Persist scoring configuration independently from Answers. It must support:

- scoring type;
- points;
- enabled/disabled configuration;
- Round/PlayoffRound scope;
- `againstRival` for `CLOSEST_VALUE` where H2H exists;
- unanswered-question penalty.

Scoring is per Question; only unanswered penalty is Round-wide. Award values are integers
from 1 through 100. Match defaults are 3/2/1 and must satisfy EXACT_SCORE > enabled
GOAL_DIFFERENCE > NORMAL_RESULT. Other Question types default to 1 point. OPTIONS contains
2–20 ordered, uniquely labelled options. CLOSEST_VALUE `againstRival=true` is invalid for
LEAGUE.

Match hierarchy:

```text
EXACT_SCORE
    ↓ if not awarded
GOAL_DIFFERENCE (when enabled)
    ↓ if not awarded
NORMAL_RESULT
```

A successful higher-priority rule must not also award a lower-priority rule.

`GOAL_DIFFERENCE` only applies to Home/Away wins and requires both numerical difference and direction to match.

## 10. PlayoffRound

```text
PlayoffRound
├── id
├── competitionId
├── sequence
├── name
├── startsAt
├── status
├── unansweredPenalty
├── advancementMode
├── tiebreakerQuestionId
├── publishedAt
├── finishedAt
├── finalizedAt
├── createdAt
└── updatedAt
```

`(competitionId, sequence)` is unique.

`advancementMode`:

```text
BEST_SEED
TIEBREAKER_QUESTION
```

Before publication, Admin may edit scoring rules, tiebreaker question, and advancement mode. After publication they are frozen.

All Matchups in one PlayoffRound use the same `tiebreakerQuestionId`. Different PlayoffRounds may use different questions. Answers cannot exist for an unpublished PlayoffRound.

PlayoffRounds own Questions through `Question.playoffRoundId` and use the same publication, deadline, automatic finish, 24-hour correction, and effective finalization model as regular Rounds. All participants answer the same Questions and share their Official Results.

## 11. PlayoffMatchup

```text
PlayoffMatchup
├── id
├── playoffRoundId
├── position
├── participantAId
├── participantBId
├── winnerParticipantId
├── createdAt
└── updatedAt
```

`(playoffRoundId, position)` is unique.

Supports BEST_SEED, TIEBREAKER_QUESTION, and explicit Admin resolution when approved rules leave a tie.

Initial bracket generation also persists immutable `PlayoffSeed` rows with Competition, Participant, original positive seed position, M9 source fingerprint, actor, and UTC timestamp. Participant and position are each unique within the Competition. A seed snapshot rejects later qualification-order corrections.

FINISHED matchup winners are provisional and remain derived during the correction window. Final source matchup winners are persisted only after effective FINALIZED. A successor PlayoffRound cannot publish before that final advancement exists.

## 12. GROUP_PLAYOFFS

Approved participant counts:

```text
8 / 16 / 32 / 64
```

Groups contain 4 or 8 participants.

Use explicit:

```text
CompetitionGroup
CompetitionGroupParticipant
```

The Admin manually assigns participants to groups. The system generates round-robin matchups inside each group. Group standings use H2H Points, Prediction Score, EXACT_SCORE, and H2H wins in that order; if still tied, Admin resolves the tie. Never use insertion order or random ordering.

Persist an explicit regular-phase matchup source fact:

```text
H2HMatchup
├── id
├── competitionId
├── roundId
├── groupId (nullable)
├── participantAId
├── participantBId (nullable for a bye)
├── position
├── createdAt
└── updatedAt
```

The system persists one visible server-randomized draw order and generates the configured partial `LEAGUE_PLAYOFFS` circle schedule from it, including one bye per schedule slot when the participant count is odd. Generation is transactional and retries never redraw. A win based on Round Prediction Score yields 3 H2H Points, a draw 1 each, and a loss 0; points and standings remain derived.

## 13. LEAGUE_PLAYOFFS regular phase

`LEAGUE_PLAYOFFS` has no groups.

The configured partial regular phase has no repeated pair within its persisted draw cycle.

- Maximum participants: 30.
- Number of regular-phase rounds is configurable.
- Qualifiers: 2, 4, 8, or 16 without exceeding the roster.
- Maximum: `N - 1`.

Regular `Round` records and later `PlayoffRound` records remain distinct.

## 14. Seeding

Ranking-based seeding:

1. Prediction Score DESC
2. EXACT_SCORE DESC
3. Admin resolution if still tied

Bracket positions pair the highest remaining seed against the lowest remaining seed (`1 vs 16`, `2 vs 15`, and so on). In a tied Playoff Matchup, `BEST_SEED` advances the lower-numbered/better seed.

Persist enough source data to recompute rankings. Manual resolutions must be persisted and audited.

Manual LEAGUE-standing and Round-winner resolutions use an append-only decision record plus
normalized ordered Participant entries. Each decision identifies its Competition, scope,
optional Round, complete source fingerprint, tied-group fingerprint, revision/superseded
decision, action, actor, and UTC timestamp. Entries have unique Participant and position
within the decision. The opaque source fingerprint validates applicability but is not a
persisted score, standing, or winner snapshot. A changed source fingerprint invalidates the
decision while retaining audit history.

## 15. Payments

Manual tracking only. No Stripe, Mercado Pago, PayPal, wallet, checkout, or external payment transaction in MVP.

### PaymentObligation

```text
PaymentObligation
├── id
├── competitionId
├── competitionParticipantId
├── roundId
├── amount
├── createdByUserId
├── createdAt
└── updatedAt
```

At most one obligation per participant per Round/fee context.

### Payment

```text
Payment
├── id
├── competitionParticipantId
├── amount
├── paidAt
├── recordedByUserId
├── updatedByUserId
├── createdAt
└── updatedAt
```

Partial payments, multiple payments, and overpayment credit are supported. Payments are participant-level contributions and are not allocated to individual obligations.

Publishing a Round atomically creates one obligation at the configured fee for every ACTIVE Participant. Payment creation and correction append immutable audit events; corrections update the effective Payment row and preserve before/after amount and `paidAt`. Audit events are not used to derive balances.

`PaymentObligation.amount`, `Payment.amount`, and prize amounts use integer minor units in the Competition's immutable currency, which defaults to `MXN`.

## 16. Debt and restriction

Do not persist an authoritative `currentDebt`.

Derive:

```text
outstanding balance = payment obligations - recorded payments
```

A negative outstanding balance is an allowed participant credit.

Restriction is derived from:

```text
outstanding balance > maximumDebt
```

Restriction applies only to open/future Rounds.

The restriction remains effective during the FINISHED correction window. At effective FINALIZED it no longer applies to that Round, all preserved Answers participate in the finalized derived result, and later balance changes do not alter finalized scoring. Do not persist a restriction or score snapshot for this transition.

When payment reduces the balance to `<= maximumDebt`, the participant becomes automatically eligible again. Stored Answers remain intact.

## 17. PrizeConfiguration

`Competition.financialFeaturesEnabled` is the Competition-wide gate. A round fee is
optional when it is enabled; `maximumDebt` is valid only with a round fee. Existing rows
with fee/payment configuration or prizes are enabled by the migration. All configuration
is mutable only in DRAFT. `Competition.completedAt` records explicit completion.

```text
PrizeConfiguration
├── id
├── competitionId
├── type
├── amount
├── createdAt
└── updatedAt
```

MVP prize types:

**LEAGUE**
- ROUND_WINNER
- LEAGUE_WINNER

**LEAGUE_PLAYOFFS**
- ROUND_WINNER
- LEAGUE_PHASE_WINNER
- PLAYOFF_CHAMPION

**GROUP_PLAYOFFS**
- PLAYOFF_CHAMPION

The Admin configures each prize directly. The application displays winner/prize information but does not process the actual prize payment.

## 18. Prize winner rules

Round winner:

1. Prediction Score DESC
2. More points from Match Questions DESC
3. Total Prediction Score in the League/competition phase DESC
4. Earliest submitted results

Preserve original Answer submission timestamps.

LEAGUE_PLAYOFFS league-phase prize:

1. Prediction Score DESC
2. EXACT_SCORE points DESC
3. H2H result between tied participants, when available
4. Approved Admin-resolution policy if still unresolved

Playoff Champion is the participant who wins the playoff.

## 19. Audit

Important administrative mutations preserve who and when.

At minimum, mutable administrative entities should support:

```text
updatedAt
updatedByUserId
```

Payment recording/correction and manual tie resolution must be auditable.

A generic Audit table may be used if it materially improves consistency; do not build a full accounting ledger.

## 20. IDs

Select one application-wide ID strategy during implementation. Foreign keys use the same underlying type. Round `sequence` is separate from the entity ID.

## 21. Important indexes

Expected indexes:

```text
Competition
  createdByUserId

CompetitionParticipant
  UNIQUE (competitionId, userId)
  (competitionId, status)

Round
  UNIQUE (competitionId, sequence)
  (competitionId, status)

Question
  UNIQUE (roundId, sequence)

Answer
  UNIQUE (questionId, participantId)
  (participantId, submittedAt)

OfficialResult
  UNIQUE (questionId)

PlayoffRound
  UNIQUE (competitionId, sequence)

PlayoffMatchup
  UNIQUE (playoffRoundId, position)

PaymentObligation
  UNIQUE (competitionParticipantId, roundId)

Payment
  (competitionParticipantId, paidAt)
```

Confirm indexes against actual query plans; do not index every column speculatively.

## 22. Referential integrity

Use foreign keys for meaningful relationships.

Do not casually cascade-delete historical Answers, Official Results, Payments, or audit records. Historical data has domain meaning. Prefer domain-level removal states where preservation matters.

## 23. Transactions

Use transactions where partial writes would violate invariants, including:

- publishing a Round;
- recording/correcting Official Results when dependent writes are needed;
- recording/correcting payments;
- generating playoff brackets;
- applying manual tie resolutions with audit records.

## 24. Derived data

MVP does not make these independent sources of truth:

- Prediction Score;
- H2H Points;
- standings;
- Round winner;
- League winner;
- Playoff winner;
- outstanding debt;
- payment restriction.

Persist source facts. Persist manual decisions that cannot be derived.

## 25. Implementation order

1. Better Auth integration/tables.
2. Competition.
3. CompetitionParticipant.
4. Round.
5. Question + typed question data.
6. Answer.
7. OfficialResult.
8. Scoring configuration.
9. PlayoffRound + Matchup.
10. Group structures.
11. PaymentObligation + Payment.
12. PrizeConfiguration.
13. Audit fields/table where required.

Do not implement every future question type before the first vertical slice.

## 26. Open implementation decisions

1. Exact Better Auth generated table names/adapter configuration.
2. Exact ID strategy.
3. Drizzle enum strategy.
4. Typed Question sub-tables vs explicit columns for current question families.
5. Generic audit-table strategy, if needed.
6. Exact secure invitation-token generation/hash strategy.

These are implementation decisions, not product decisions. Do not invent new product behavior while resolving them.

## 27. Acceptance criteria

The schema is ready when:

- Competition membership is separate from User.
- Admin + Participant in the same Competition is supported.
- Match scores are typed.
- Answers and Official Results are separate.
- Round lifecycle constraints are enforceable.
- PlayoffRound owns its tiebreakerQuestionId.
- Playoff configuration can differ by round.
- GROUP_PLAYOFFS supports 8/16/32/64 participants and groups of 4/8.
- LEAGUE_PLAYOFFS has no groups and supports configurable rounds up to N-1.
- Payments and obligations are separate.
- Debt is derived.
- Restrictions automatically disappear after sufficient payment.
- Prizes are separate from payment tracking.
- No external payment platform is required.
- Administrative changes are auditable.
- Prediction Scores remain derived.
- Migrations can be generated and reviewed safely.
- Local development and database tests run against isolated Dockerized PostgreSQL without requiring Neon.

## Final principle

Prefer **explicit relationships + strong constraints + derived scores + small domain logic + auditable mutations** over **generic JSON + duplicated state + hidden business logic + premature abstractions**.
