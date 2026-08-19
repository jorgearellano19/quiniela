# M4 — Rounds & Questions

## Status

`FUTURE`

## Goal

Let an Admin construct a valid playable Round and publish it with frozen questions and scoring configuration.

## User-visible outcome

Admins can draft rounds, questions, deadlines, and scoring rules, then publish a complete Round that can no longer be structurally edited.

## In scope

- Create/update Round and create/update/remove Question while DRAFT.
- Typed `MATCH_SCORE`, `CLOSEST_VALUE`, `OPTIONS`, `OPEN_TEXT`, and `EXACT_VALUE` question data, scoring configuration, deadlines, and unanswered penalty.
- `publishRound` and publication freeze.
- Round lifecycle foundation through atomic publication/ACTIVE open state.

## Out of scope

- Participant Answers, Official Results, scoring calculations, standings, payments, and PlayoffRounds.
- Official Result-driven FINISHED and elapsed-time FINALIZED behavior beyond types needed for forward compatibility.
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
- OPTIONS is single-select; EXACT_VALUE is exact numeric; CLOSEST_VALUE is numeric; OPEN_TEXT stores free text for later Admin judgment.
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

Add `Round`, typed Question storage for all five approved families, ordered OPTIONS values, and scoring configuration scoped to Round. Add specified uniqueness/status indexes and foreign keys. Publishing must transactionally validate, freeze, and open the aggregate. Do not add Answer or OfficialResult tables yet.

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
- [ ] Publish atomically records PUBLISHED freeze and moves the Round to ACTIVE.
- [ ] ACTIVE Questions accept Answers until their individual absolute deadlines; no separate Admin activation is required.
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

Exact numeric precision/range and maximum OPTIONS count are boundary-validation implementation decisions to settle in the M4 plan without changing scoring semantics.
