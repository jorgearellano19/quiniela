# Database Schema — Quiniela MVP

**Status:** APPROVED AND LOCKED  
**Provider:** Neon PostgreSQL  
**ORM:** Drizzle

## 1. Principles

- PostgreSQL is the authoritative persistence layer.
- Use explicit relational modeling and foreign keys.
- Keep domain rules out of persistence code.
- Persist source facts; derive Prediction Scores, standings, winners, debt, and restrictions.
- Store timestamps in UTC; presentation converts them to the user's timezone.
- Better Auth owns authentication identity tables.
- Competition membership is separate from global User identity.
- The same User may be Admin and Participant in the same Competition.
- MVP has manual payment tracking only; no external payment provider.

## 2. Core relationship model

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
├── paymentsEnabled
├── maximumDebt
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

`maximumDebt` is nullable when no restriction is configured. Do not create payment obligations when payments are disabled.

## 4. CompetitionParticipant

```text
CompetitionParticipant
├── id
├── competitionId
├── userId
├── role/capabilities
├── status
├── joinedAt
├── approvedAt
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

Enforce at most one active participant record per User + Competition.

## 5. Round

```text
Round
├── id
├── competitionId
├── sequence
├── name
├── status
├── publishedAt
├── finishedAt
├── finalizedAt
├── createdAt
└── updatedAt
```

`(competitionId, sequence)` is unique.

Lifecycle:

```text
DRAFT → PUBLISHED → ACTIVE → FINISHED → FINALIZED
```

- DRAFT: Questions and scoring rules editable.
- PUBLISHED: Questions and scoring rules frozen.
- ACTIVE: Answers may be submitted subject to deadlines/restrictions.
- FINISHED: 24-hour Official Result correction window.
- FINALIZED: Official Results immutable.

## 6. Question

```text
Question
├── id
├── roundId
├── sequence
├── type
├── prompt
├── deadlineAt
├── createdAt
└── updatedAt
```

`(roundId, sequence)` is unique.

Do not create one giant JSON structure for all question types. Use typed columns or type-specific tables where appropriate.

For Match Questions, scores are numeric `homeScore` and `awayScore`, never only a string such as `"3-1"`.

## 7. Answer

```text
Answer
├── id
├── questionId
├── participantId
├── submittedAt
├── updatedAt
└── typed answer data
```

`(questionId, participantId)` is unique.

- Preserve original `submittedAt`; editing must not reset it.
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

## 9. Scoring configuration

Persist scoring configuration independently from Answers. It must support:

- scoring type;
- points;
- enabled/disabled configuration;
- Round/PlayoffRound scope;
- `againstRival` for `CLOSEST_VALUE` where H2H exists;
- unanswered-question penalty.

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
├── status
├── advancementMode
├── tiebreakerQuestionId
├── publishedAt
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

Group standings use H2H Points as the first ranking criterion. If still tied after the approved H2H comparison, Admin resolves the tie. Never use insertion order or random ordering.

## 13. LEAGUE_PLAYOFFS regular phase

`LEAGUE_PLAYOFFS` has no groups.

All participants play one another in the regular phase.

- Maximum participants: 30.
- Number of regular-phase rounds is configurable.
- Maximum: `N - 1`.

Regular `Round` records and later `PlayoffRound` records remain distinct.

## 14. Seeding

Ranking-based seeding:

1. Prediction Score DESC
2. EXACT_SCORE DESC
3. Admin resolution if still tied

Persist enough source data to recompute rankings. Manual resolutions must be persisted and audited.

## 15. Payments

Manual tracking only. No Stripe, Mercado Pago, PayPal, wallet, checkout, or external payment transaction in MVP.

### PaymentObligation

```text
PaymentObligation
├── id
├── competitionParticipantId
├── roundId
├── amount
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
├── createdAt
└── updatedAt
```

Partial payments are supported. Multiple payments may satisfy obligations. Payment allocation semantics must be explicit before final migration design.

## 16. Debt and restriction

Do not persist an authoritative `currentDebt`.

Derive:

```text
outstanding balance = payment obligations - recorded payments
```

Restriction is derived from:

```text
outstanding balance > maximumDebt
```

Restriction applies only to open/future Rounds.

When payment reduces the balance to `<= maximumDebt`, the participant becomes automatically eligible again. Stored Answers remain intact.

## 17. PrizeConfiguration

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
5. Exact payment allocation semantics for partial payments covering multiple obligations.
6. Generic audit-table strategy, if needed.
7. Historical membership deletion/removal strategy.

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

## Final principle

Prefer **explicit relationships + strong constraints + derived scores + small domain logic + auditable mutations** over **generic JSON + duplicated state + hidden business logic + premature abstractions**.
