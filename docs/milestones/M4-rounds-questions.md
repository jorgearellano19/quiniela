# M4 — Rounds & Questions

## Status

`FUTURE`

## Goal

Let an Admin construct a valid playable Round and publish it with frozen questions and scoring configuration.

## User-visible outcome

Admins can draft rounds, questions, deadlines, and scoring rules, then publish a complete Round that can no longer be structurally edited.

## In scope

- Create/update Round and create/update/remove Question while DRAFT.
- Typed current question data, scoring configuration, deadlines, and unanswered penalty.
- `publishRound` and publication freeze.
- Round lifecycle foundation through `PUBLISHED` only.

## Out of scope

- Participant Answers, Official Results, scoring calculations, standings, payments, and PlayoffRounds.
- ACTIVE/FINISHED/FINALIZED behavior beyond types needed for forward compatibility.
- Speculative future question families.

## Dependencies

M4 depends on:
- M1
- M2
- M3

## Relevant specifications

- `docs/product/product-spec.md` §5–7, §9, §17
- `docs/specs/domain-model.md` “Round lifecycle” and “Questions, Answers, and Official Results”
- `docs/specs/database-schema.md` §5–6, §9, §20–23
- `docs/specs/application-use-cases.md` §6–7
- `docs/specs/implementation-spec.md` §6–18, §30–31
- `docs/specs/testing-strategy.md`

## Relevant skills

- `domain-rules`
- `application`
- `database`
- `nextjs`
- `testing`

## Domain rules / invariants

- Lifecycle begins `DRAFT → PUBLISHED`; transitions are explicit, never unrestricted status assignment.
- Questions and scoring rules are editable only in DRAFT and frozen at publication.
- Match scores use numeric typed fields, not a single score string.
- `(competitionId, sequence)` and `(roundId, sequence)` are unique; deadlines are absolute UTC timestamps.
- Unanswered penalty is approved as `-1` or configurable `0`.

## Application use cases

- `createRound`
- `updateRound`
- `createQuestion`
- `updateQuestion`
- `removeQuestion`
- `publishRound`

## Persistence impact

Add `Round`, `Question`, typed question storage needed for approved current families, and scoring configuration scoped to Round. Add specified uniqueness/status indexes and foreign keys. Publishing must transactionally validate and freeze the aggregate. Do not add Answer or OfficialResult tables yet.

## Authorization

- Only an authenticated Competition Admin may mutate a Round/Question in that Competition.
- Participant-only, anonymous, cross-Competition, and mismatched parent IDs are rejected.
- Publication state must be reloaded and checked server-side on every mutation.

## Deliverables

- Domain lifecycle/configuration invariants.
- Authorized application use cases and safe DTOs.
- Schema migration, repositories/queries, and publish transaction.
- Admin draft/editor/publish UI.
- Domain, integration, authorization, and focused UI tests.

## Testing requirements

- Unit-test valid and invalid publication transitions and configuration freeze.
- Integration-test uniqueness, typed match data, and atomic publish behavior.
- Cover every mutation's authorization matrix.
- E2E is optional here; the full Round critical flow is completed in M6.

## Acceptance criteria

- [ ] Admin can create and edit a DRAFT Round.
- [ ] Admin can create, edit, and remove typed Questions while DRAFT.
- [ ] Valid scoring rules, penalty, and deadlines are persisted.
- [ ] Publish atomically moves DRAFT to PUBLISHED.
- [ ] Questions/scoring cannot change after publication.
- [ ] Unauthorized and cross-Competition mutations fail.
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

Select typed columns versus type-specific tables only for demonstrated question families. Publication is a business transaction, not a UI flag.

## Open questions

The specs require typed question data but do not enumerate the complete MVP question-type catalog or exact fields beyond Match and `CLOSEST_VALUE`. Confirm the first supported families before final migration design. The actor/timing policy for `PUBLISHED → ACTIVE` is also unspecified and is deferred to M5.

