# Application Use Cases — Quiniela MVP

**Status:** APPROVED AND LOCKED — revised 2026-08-19

## 1. Purpose

Define the application-level operations that orchestrate the approved domain model.

This document answers:

> What can the system do, who can do it, under what conditions, and what domain operation is invoked?

It does not define UI components, React Query, route structure, or database implementation details.

## 2. Layering

```text
UI
 ↓
Application Use Case
 ↓
Domain
 ↓
Persistence Adapter
 ↓
PostgreSQL
```

Application use cases are responsible for:
- authentication/session context;
- Competition-scoped authorization;
- loading required state;
- invoking domain operations;
- persistence transactions;
- returning application-safe results.

Domain rules remain in the Domain layer.

## 3. Authorization model

Every mutation must establish:
1. authenticated User;
2. target Competition/resource;
3. Competition Participant membership where applicable;
4. required Admin or Participant capability.

Never trust a client-provided participant ID as authorization.

A User who is both Admin and Participant may invoke either capability.

`platform_operator` is a global Better Auth role used only for account-support operations; it never satisfies a Competition authorization check. Approved operations are exact-email security lookup, account suspension/restoration, target-session revocation, and issuance of a server-generated 15-minute temporary password after recording a verification method and non-sensitive note. Active operators cannot be targeted through application operations, role grant/revoke is CLI-only, and every mutation is audited.

Temporary-password issuance replaces the previous credential and revokes all sessions transactionally. The resulting session may access only password replacement and sign-out until the user supplies the temporary password as the current password and chooses a permanent replacement.

## 4. Error handling

Use stable application/domain error categories.

The application layer may translate domain errors into safe user-facing errors.

Never expose:
- stack traces;
- database errors;
- internal authorization details;
- sensitive implementation information.

---

# 5. Competition Use Cases

## createCompetition

**Actor:** authenticated User

Creates a Competition and establishes the creator as Admin.

Input:
- name;
- Competition type;
- initial configuration;
- optional payment configuration.

Rules:
- validate type-specific configuration;
- creator becomes Admin;
- creator may also participate independently.

Returns:
- Competition;
- creator membership.

## updateCompetition

**Actor:** Admin

Updates editable Competition configuration.

Must reject fields frozen by lifecycle rules.

Examples:
- Competition name;
- payment settings;
- maximum debt;
- prize configuration;
- competition-specific scoring configuration where still editable.

## generateInvitationLink

**Actor:** Admin

Creates or rotates one reusable opaque invitation link for a DRAFT Competition. Store only its secure token hash. The Admin may revoke it; it otherwise expires when the Competition starts.

## viewInvitation

**Actor:** authenticated User

Validates the invitation and returns the Competition name, structured rule/configuration summary, and optional Admin-authored rules note. Viewing does not create membership or persist rule acceptance.

## requestToJoin

**Actor:** authenticated User

After the invitation rules have been displayed, creates or restores the caller's membership as `PENDING`. Never accept a client-provided User/Participant identity. Admin approval remains required.

## inviteParticipant

**Actor:** Admin

Creates/invites a prospective Competition Participant.

The User must not become an active participant until the approved invitation/acceptance flow is completed.

## approveParticipant

**Actor:** Admin

Moves a pending participant to ACTIVE.

Validate Competition participant limits and type-specific constraints.

## removeParticipant

**Actor:** Admin

Removes a participant according to the approved Competition lifecycle rules.

Historical Answers, Results, Payments, and audit records must not be casually deleted.

During Competition DRAFT, an Admin may remove a participant who has already joined, including accidental removals followed by re-approval if the flow permits it.

## leaveCompetition

**Actor:** Participant

Leaves only while the Competition is DRAFT. Reject after STARTED.

Do not allow this operation to bypass historical integrity.

## startCompetition

**Actor:** Admin

Moves `DRAFT → STARTED`, locks Competition rules, and invalidates the invitation link atomically. Validate Competition-type participant/configuration constraints. MVP does not require persisted rule acceptance by every Participant.

## completeCompetition

**Actor:** Admin

Moves `STARTED → COMPLETED`. For LEAGUE, require all required Rounds effectively FINALIZED and the League winner resolved. For LEAGUE_PLAYOFFS/GROUP_PLAYOFFS, require all required regular/playoff phases effectively FINALIZED and the Playoff Champion resolved. Completion locks remaining administrative configuration and preserves read-only history.

---

# 6. Round Use Cases

## createRound

**Actor:** Admin

Creates a Round in DRAFT.

Input:
- sequence;
- name;
- questions/configuration;
- scoring rules;
- optional payment configuration.

Validate:
- unique sequence;
- Competition type constraints;
- scoring configuration.

## updateRound

**Actor:** Admin

Updates a DRAFT Round.

Can modify:
- Questions;
- Question configuration;
- deadlines;
- scoring rules;
- Round payment configuration.

Once PUBLISHED, these are frozen.

## publishRound

**Actor:** Admin

Publishes a DRAFT Round.

Preconditions:
- valid Questions;
- valid scoring rules;
- valid deadlines;
- all required configuration complete.

Transactionally freezes:
- Questions;
- scoring rules.

After publication, no new Questions may be added.

Publishing atomically advances through PUBLISHED to ACTIVE and opens Answers until each Question deadline; MVP has no separate Admin `activateRound` mutation.

The write that records the final required Official Result automatically moves the Round to FINISHED and starts the 24-hour correction window.

At `finishedAt + 24 hours`, server-authoritative time makes the Round effectively FINALIZED without an Admin action or background worker. An idempotent persistence update may materialize `finalizedAt`, but authorization must enforce the elapsed-time boundary independently.

After effective finalization:
- Official Results are immutable;
- historical scoring is immutable.

---

# 7. Question Use Cases

## createQuestion

**Actor:** Admin

Only allowed while the parent Round is DRAFT.

Validate:
- Question type;
- required fields;
- sequence;
- deadline;
- scoring compatibility.

Approved types are `MATCH_SCORE`, `CLOSEST_VALUE`, `OPTIONS`, `OPEN_TEXT`, and `EXACT_VALUE`. The same use cases apply to Questions owned by a DRAFT regular Round or unpublished PlayoffRound.

## updateQuestion

**Actor:** Admin

Only allowed while Round is DRAFT.

## removeQuestion

**Actor:** Admin

Only allowed while Round is DRAFT.

Do not allow deletion once published.

---

# 8. Answer Use Cases

## submitAnswer

**Actor:** Participant

Preconditions:
- authenticated User;
- ACTIVE participant;
- parent regular Round or PlayoffRound is published;
- Question exists;
- Question deadline has not passed;
- participant is not payment-restricted;
- Answer is valid for Question type.

The server must validate all conditions.

`submittedAt` is set only on first submission.

## updateAnswer

**Actor:** Participant

Uses the same authorization/deadline/restriction checks as submission.

Updating an Answer does not reset original `submittedAt`.

The client does not need to know the internal reason an Answer is unavailable for editing.

## getMyAnswers

**Actor:** Participant

Returns the current participant's Answers for an allowed Competition/Round.

Never accept an arbitrary participant ID as the identity source.

---

# 9. Official Result Use Cases

## recordOfficialResult

**Actor:** Admin

Records an Official Result for a Question.

Preconditions:
- authorized Admin;
- Question is eligible for result entry;
- result not already finalized;
- result data is valid.

For Match Questions, validate numeric home/away scores.

## correctOfficialResult

**Actor:** Admin

Corrects an Official Result during the 24-hour FINISHED correction window.

After FINALIZED, reject the operation.

Corrections must be audited.

Dependent derived scores/standings are recalculated when queried or through the approved derived-state mechanism.

## judgeOpenTextAnswer

**Actor:** Admin

Marks one `OPEN_TEXT` Answer correct or incorrect. The judgment is an auditable source fact with actor/time and may be corrected only while the parent regular Round or PlayoffRound remains within its correction policy.

Every submitted OPEN_TEXT Answer must be judged before the final required Result can automatically finish the parent.

## finalizeResults

An optional idempotent system operation may materialize effective finalization after the correction window, but elapsed server time is authoritative and no Admin mutation is required.

---

# 10. Scoring Queries

## getQuestionScore

Returns the score awarded for one Answer against the Official Result and active scoring configuration.

Must respect:

```text
EXACT_SCORE
→ GOAL_DIFFERENCE (if enabled)
→ NORMAL_RESULT
```

and `CLOSEST_VALUE.againstRival` where applicable.

Without `againstRival`, `CLOSEST_VALUE` compares all eligible Answers in the Round and awards the configured point to every participant tied at the closest distance. `OPTIONS` scores its official correct option, `EXACT_VALUE` requires numeric equality, and `OPEN_TEXT` uses the Admin's explicit correct/incorrect judgment.

## getPredictionScore

Calculates the participant's Prediction Score for the requested scope.

Input:
- Competition;
- Participant;
- Round or phase.

Output:
- total Prediction Score;
- relevant scoring breakdown if requested.

Prediction Score remains derived in MVP.

## getH2HPoints

Returns H2H Points for the requested scope.

Prediction Score must not be substituted for H2H Points.

For each regular H2H Round, higher Round Prediction Score awards 3 H2H Points to the winner and 0 to the loser; equal scores award 1 each.

---

# 11. Standings Queries

## getLeagueStandings

For LEAGUE:

Sort by:
1. Prediction Score DESC;
2. EXACT_SCORE DESC for the MVP League tiebreaker;
3. approved Admin resolution if still tied.

## getH2HStandings

For H2H competitions:

```text
1. H2H Points DESC
2. Prediction Score DESC
3. EXACT_SCORE DESC
4. More H2H wins
```

If an approved manual resolution exists, apply it.

## getGroupStandings

For GROUP_PLAYOFFS:

- calculate H2H Points;
- apply the approved H2H/group ordering;
- if the required comparison remains tied, require/apply Admin resolution.

---

# 12. Round Winner Query

## getRoundWinner

Determines the winner for a Round prize.

Ordering:

```text
1. Prediction Score DESC
2. Match Question points DESC
3. Total Prediction Score in the League/competition phase DESC
4. Earliest submitted results
```

Use original Answer submission timestamps.

If the approved criteria remain tied, return an unresolved-tie state rather than choosing arbitrarily.

---

# 13. LEAGUE Use Cases

## getLeagueWinner

At Competition completion:

1. calculate total Prediction Score;
2. apply League tiebreaker:
   - EXACT_SCORE points DESC;
3. use approved Admin resolution if still tied.

---

# 14. LEAGUE_PLAYOFFS Use Cases

## configureLeaguePhase

Admin configures the regular League phase.

Validate:
- maximum 30 participants;
- number of Rounds is configurable;
- maximum `N - 1`;
- no groups.

## generateLeaguePhaseSchedule

**Actor:** Admin/system

Deterministically generates the all-play-all round-robin matchups. An odd participant count creates one bye in each schedule slot. Generation is idempotent and transactional.

## getLeaguePhasePrizeWinner

Determine the participant with the highest Prediction Score across the League phase.

Tiebreaking:

```text
1. Prediction Score DESC
2. EXACT_SCORE points DESC
3. H2H result between tied participants, when available
```

If still unresolved, require Admin resolution.

## configurePlayoffRound

**Actor:** Admin

Creates/configures an unpublished PlayoffRound.

Editable before publication:
- scoring rules;
- tiebreaker Question;
- advancement mode.

It also creates/updates the PlayoffRound's Questions, typed configuration, deadlines, and Official Result requirements through the shared Question behavior.

Advancement modes:

```text
BEST_SEED
TIEBREAKER_QUESTION
```

## publishPlayoffRound

**Actor:** Admin

Freezes the PlayoffRound configuration.

Preconditions:
- valid configuration;
- valid participants/seeding;
- required tiebreaker Question when applicable.

No Answers may exist for an unpublished PlayoffRound.

## generateSeeding

**Actor:** Admin

Supports:
ranking-based high-vs-low bracket seeding:

```text
1. Prediction Score DESC
2. EXACT_SCORE DESC
3. Admin resolution
```

## generatePlayoffBracket

**Actor:** Admin/system

Creates PlayoffMatchups according to the selected seeding method.

Validate bracket structure.

## resolvePlayoffMatchup

Determines the winner according to the PlayoffRound's advancement mode.

`BEST_SEED`:
- compare opponents' derived PlayoffRound Prediction Scores;
- if tied, the lower-numbered/better seed advances.

`TIEBREAKER_QUESTION`:
- evaluate the configured tiebreaker Question.

If still unresolved:
- return `UnresolvedTie`;
- require Admin resolution.

## resolvePlayoffTie

**Actor:** Admin

Persists the explicit manual winner decision.

Must be auditable.

## getPlayoffChampion

Returns the winner of the final PlayoffMatchup.

---

# 15. GROUP_PLAYOFFS Use Cases

## configureGroups

**Actor:** Admin

Validate:
- participant count is 8, 16, 32, or 64;
- group size is 4 or 8;
- resulting playoff structure is valid;
- configured number advancing per group is compatible with the structure.

## generateGroups

Persists the Admin's manual valid group assignments, then transactionally generates a round-robin schedule within each group.

## getGroupStandings

Uses H2H Points as the primary ranking criterion.

Then applies Prediction Score, EXACT_SCORE, and H2H wins in that order.

If still tied under the approved comparison:
- return unresolved state;
- require Admin resolution.

## resolveGroupTie

**Actor:** Admin

Persists the manual group ranking/tie decision.

Must be auditable.

---

# 16. Payment Use Cases

Payments are optional.

No online payment processor is involved.

## configurePayments

**Actor:** Admin

Enables/disables payment tracking and configures:
- payment per Round;
- applicable prize amounts;
- maximum debt.

Configuration must match Competition type.

## createPaymentObligation

**Actor:** Admin/system

Creates the amount owed by a participant for a configured Round/fee context.

The participant's obligation is independent from the prize.

## getMyDebt

**Actor:** Participant

Returns:
- total outstanding amount;
- applicable obligations;
- recorded payments;
- remaining balance.

All amounts are application data only; no payment transaction is initiated.

## getCompetitionPaymentStatus

**Actor:** Admin

Returns payment status for participants, including:
- owed;
- paid;
- remaining;
- restriction eligibility.

## recordPayment

**Actor:** Admin

Records a manual payment.

Payments are participant-level contributions, are not allocated to obligations, and may exceed current debt to create a credit balance. Monetary amounts use integer minor units in the Competition's immutable currency, defaulting to `MXN`.

When the resulting balance becomes:

```text
outstandingDebt <= maximumDebt
```

the participant automatically becomes eligible again.

No separate "unrestrict" operation is required.

## updatePayment

**Actor:** Admin

Corrects a recorded payment.

Must be audited.

## getPaymentWinner

Returns the Round winner for the configured payment/prize.

The winner receives the configured prize externally; the application only records/displays the result.

---

# 17. Prize Use Cases

## configurePrize

**Actor:** Admin

Creates/updates a configured prize.

Supported types:

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

## getPrizeWinner

Returns the domain winner for the selected prize type.

The application does not transfer money.

---

# 18. Audit Use Cases

Audit is primarily a side effect of mutations, not a user-facing CRUD feature.

Mutations requiring audit include:
- Official Result corrections;
- payment corrections;
- participant removal;
- manual tie resolution;
- seeding resolution;
- manual winner resolution.

The audit record must identify:
- actor;
- timestamp;
- affected resource;
- action;
- relevant before/after decision data where appropriate.

---

# 19. Query vs Mutation policy

### Queries

Queries must not mutate domain state.

Examples:

```text
getMyAnswers
getPredictionScore
getLeagueStandings
getGroupStandings
getH2HStandings
getRoundWinner
getMyDebt
getCompetitionPaymentStatus
getPlayoffChampion
getPrizeWinner
```

### Mutations

Mutations may change state and must enforce authorization and domain invariants.

Examples:

```text
createCompetition
approveParticipant
publishRound
submitAnswer
recordOfficialResult
configurePlayoffRound
recordPayment
resolvePlayoffTie
```

---

# 20. Transaction policy

Use a database transaction whenever one logical mutation requires multiple persistent changes that must succeed/fail together.

Examples:
- publishing a Round;
- publishing a PlayoffRound;
- generating a playoff bracket;
- recording a payment plus required audit record;
- correcting an Official Result plus required audit record;
- manual tie resolution plus audit record.

Do not wrap every read in a transaction.

---

# 21. Idempotency

Operations that may be retried by the UI/network should be safe against accidental duplicate effects.

Particularly:
- publish operations;
- payment recording;
- Official Result writes;
- playoff generation.

Where a mutation cannot naturally be idempotent, enforce uniqueness or use an application-level idempotency mechanism.

---

# 22. Time

Persist timestamps in UTC.

The application receives/returns user-local presentation values when appropriate.

A Competition does not have a timezone.

Question deadlines are absolute timestamps.

The application must compare deadlines against a server-authoritative current time.

---

# 23. Application result shapes

Use application-safe results rather than exposing persistence entities blindly.

Examples:

```text
CompetitionSummary
ParticipantSummary
RoundSummary
QuestionSummary
AnswerSummary
StandingsRow
PaymentSummary
PrizeSummary
```

The exact DTO/type names are implementation details, but application boundaries should not leak database internals unnecessarily.

---

# 24. Implementation rules for Codex

When implementing a use case:

1. Load only the state required.
2. Authorize against the authenticated User and Competition membership.
3. Validate application-level preconditions.
4. Invoke the domain operation.
5. Persist the resulting changes transactionally when required.
6. Write audit information for auditable mutations.
7. Return an application-safe result.
8. Never duplicate domain scoring/lifecycle rules inside a Server Action.

Do not create a second business-logic implementation in:
- React components;
- route handlers;
- Server Actions;
- database queries.

---

# 25. Acceptance criteria

This specification is ready when every MVP mutation/query has:
- an explicit actor;
- authorization requirements;
- preconditions;
- domain responsibility;
- persistence responsibility;
- error behavior.

The Application layer must orchestrate the domain, not replace it.

## Final principle

**Application use cases should be thin orchestration around strong domain rules: authorize, load, invoke, persist, audit, return.**
