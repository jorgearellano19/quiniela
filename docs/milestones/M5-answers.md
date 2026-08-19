# M5 — Answers

## Status

`FUTURE`

## Goal

Allow an active Participant to submit and safely edit predictions for an available Round.

## User-visible outcome

Participants can open a Round, answer its Questions, revisit saved Answers, and edit only while the server says editing remains allowed.

## In scope

- Participant Round/question view and `getMyAnswers`.
- `submitAnswer` and `updateAnswer` with typed validation.
- Published regular Round answer behavior for all five approved typed Question families.
- Deadline, membership, ownership, and server-authoritative editability.
- Original `submittedAt` preservation and unanswered representation without fake rows.

## Out of scope

- Official Results, calculated scores, standings, payment restriction enforcement, and PlayoffRound Answers.
- Client-visible internal reasons for non-editability.

## Dependencies

M5 depends on:
- M1
- M2
- M3
- M4

## Relevant specifications

- `docs/product/product-spec.md` §5–6, §9–10, §17
- `docs/specs/domain-model.md` “Round lifecycle,” “Questions, Answers, and Official Results,” and “Unanswered questions”
- `docs/specs/database-schema.md` §5–7, §20–23
- `docs/specs/application-use-cases.md` §6 and §8
- `docs/specs/implementation-spec.md` §7–18, §28, §31
- `docs/specs/testing-strategy.md`

## Relevant skills

- `domain-rules`
- `application`
- `database`
- `nextjs`
- `testing`

## Domain rules / invariants

- Only one Answer exists per Question + Participant.
- `submittedAt` is set once; editing changes `updatedAt`, not original submission time.
- Server time, persisted Round state, deadline, membership, and ownership determine editability.
- Atomic publication leaves the Round ACTIVE and opens Answers; every Question closes independently at its absolute deadline.
- Missing Answers remain absent rows; unanswered penalties are calculated later.
- The client may receive `canEdit`, never sensitive denial reasons.

## Application use cases

- `submitAnswer`
- `updateAnswer`
- `getMyAnswers`

## Persistence impact

Add `Answer` with typed answer data, unique `(questionId, participantId)`, `(participantId, submittedAt)` index, UTC timestamps, and foreign keys. Upsert/edit behavior must preserve `submittedAt`. No score columns or snapshots.

## Authorization

- Actor must resolve to the active Competition Participant; never trust client participant ID.
- Participant A cannot read/mutate Participant B's private Answers.
- Admin capability alone does not impersonate a Participant.
- Anonymous, removed/pending, cross-Competition, late, and unavailable-Round submissions fail safely.

## Deliverables

- Framework-independent Answer editability/validation behavior.
- Authorized use cases and safe participant DTOs.
- Answer migration and persistence operations.
- Participant Round and answer form UI.
- Domain, persistence, application, authorization, and focused interaction tests.

## Testing requirements

- Test deadline boundary, state, ownership, original timestamp, update, duplicate, and missing Answer behavior.
- Cover anonymous, Participant, Admin-only, Admin+Participant, cross-participant, and cross-Competition cases.
- Integration-test uniqueness and timestamp preservation.

## Acceptance criteria

- [ ] Active Participant can submit a valid Answer for an available Question.
- [ ] Participant can edit while allowed without resetting `submittedAt`.
- [ ] Late, unauthorized, and cross-participant mutations are rejected.
- [ ] Missing Answers create no fake rows.
- [ ] UI exposes capability, not internal editing-state reasons.
- [ ] No scoring snapshot or calculation is introduced.
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

Use a server-authoritative clock. Keep Answer persistence type-specific without a speculative generic JSON model.

## Open questions

None.
