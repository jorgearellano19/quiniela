# M4 — Rounds & Questions

## Status

`IN PROGRESS`

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

- DRAFT Rounds may be prepared while a Competition is DRAFT or STARTED. Publication
  requires a STARTED Competition; a COMPLETED Competition rejects every Round mutation.
- Publication atomically records `publishedAt` and persists ACTIVE after passing through
  PUBLISHED. Repeating publication for the same ACTIVE Round is idempotent.
- Multiple ACTIVE Rounds are valid; each Question closes independently at its deadline.
- Questions and scoring rules are editable only in DRAFT and frozen at publication.
- Competition typed scoring defaults remain editable through STARTED for unpublished
  inheriting Questions. Questions may override them; publication snapshots effective
  scoring.
- Round start is the default answer deadline; Questions use it or a custom UTC deadline.
- `MATCH_SCORE` has distinct home/away labels and no prompt. OPTIONS use ordered chips.
- Round and Question sequences define display order and use accessible reorder controls.
- Round names are unique within a Competition after trimming and case folding. Admins may
  hard-delete a DRAFT Round and its DRAFT Questions; published/ACTIVE Rounds are preserved.
- Match scores use numeric typed fields, not a single score string.
- OPTIONS is single-select; EXACT_VALUE is exact numeric; CLOSEST_VALUE is numeric; OPEN_TEXT stores free text for later Admin judgment.
- `(competitionId, sequence)` and `(roundId, sequence)` are unique; deadlines are absolute UTC timestamps.
- Scoring is configured per Question. Match defaults are 3/2/1, other Questions default
  to 1 point, and the Round-wide unanswered penalty defaults to -1 and accepts only -1/0.
- Award values are integers 1–100. Match hierarchy requires EXACT_SCORE > enabled
  GOAL_DIFFERENCE > NORMAL_RESULT. OPTIONS contains 2–20 uniquely labelled ordered
  values. CLOSEST_VALUE rival mode is invalid for LEAGUE.
- Draft sequences are positive and unique but may contain gaps. Publication requires at
  least one complete Question and deadlines strictly after server-authoritative time.

## Application use cases

- `createRound`
- `updateRound`
- `createQuestion`
- `updateQuestion`
- `removeQuestion`
- `deleteRound`
- `reorderRounds`
- `reorderQuestions`
- `updateCompetitionQuestionScoringDefaults`
- `publishRound`

## Persistence impact

Add `Round`, required regular-Round-owned Questions, ordered OPTIONS values, and one-to-one
typed Question scoring configuration. Publishing and Question mutations lock/recheck the
parent Round transactionally. M10 adds PlayoffRound ownership; M5 adds Answers; M6 adds
Official Results and scoring. Do not add any of those early.

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
- Mobile E2E covers drafting, all five Question types, publication, and the read-only ACTIVE
  state. M6 extends that flow through Answers, Results, scoring, and finish.

## Acceptance criteria

- [x] Admin can create and edit a DRAFT Round.
- [x] Admin can create, edit, and remove typed Questions while DRAFT.
- [x] Valid scoring rules, penalty, and deadlines are persisted.
- [x] Publish atomically records PUBLISHED freeze and moves the Round to ACTIVE.
- [x] ACTIVE establishes the open state that M5 consumes until each Question deadline; no
  separate Admin activation is required.
- [x] Questions/scoring cannot change after publication.
- [x] Unauthorized and cross-Competition mutations fail.
- [ ] Relevant tests, lint, typecheck, and build pass.

## Definition of Done

- [x] Scope implemented.
- [x] Out-of-scope functionality was not introduced.
- [x] Approved domain rules preserved.
- [x] Authorization enforced server-side.
- [x] Relevant tests added.
- [x] No duplicated business logic.
- [x] Locked specifications changed only for the explicitly approved M4 decisions.
- [x] lint passes.
- [x] typecheck passes.
- [x] tests pass.
- [ ] build passes.
- [x] milestone code review completed.

## Risks / implementation notes

Select typed columns versus type-specific tables only for demonstrated question families. Publication is a business transaction, not a UI flag.

## Open questions

The standard Turbopack build remains blocked in this execution environment because its CSS
worker cannot bind an internal port (`Operation not permitted`). The webpack production
build and dedicated M4 mobile E2E flow pass. Keep M4 `IN PROGRESS` until the standard build
passes in an unrestricted environment and the user completes manual testing.
