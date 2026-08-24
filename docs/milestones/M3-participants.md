# M3 — Participants & Membership

## Status

`FUTURE`

## Goal

Let Competition Admins manage participation while establishing the full contextual authorization model.

## User-visible outcome

Users can enter an approved invitation/join flow; Admins can approve, reject, or remove memberships, and one User can be both Admin and Participant.

## In scope

- Reusable opaque invitation-link generation/rotation/revocation, authenticated invitation view, and rules-before-request flow.
- Pending join request, approval, rejection, allowed removal, and same-row re-request/reapproval behavior.
- `PENDING`, `ACTIVE`, `REJECTED`, and `REMOVED` membership states.
- Admin + Participant capability coexistence and contextual authorization.
- `startCompetition`, including rule lock and invitation invalidation.

## Out of scope

- Rounds, questions, Answers, standings, payments, and Competition ownership transfer.
- Global roles or client-authoritative membership checks.
- Persisted per-participant rule acceptance/version gates, recipient-specific invitations, and invitations after Competition start.

## Dependencies

M3 depends on:
- M1.1
- M2

## Relevant specifications

- `docs/product/product-spec.md` §2
- `docs/specs/domain-model.md` “Competition and Participant”
- `docs/specs/database-schema.md` §4, §20–23
- `docs/specs/application-use-cases.md` §3 and §5
- `docs/specs/implementation-spec.md` §7–10, §18, §20, §28
- `docs/specs/testing-strategy.md` authorization coverage

## Relevant skills

- `domain-rules`
- `application`
- `database`
- `nextjs`
- `testing`

## Domain rules / invariants

- Membership/capabilities are Competition-scoped and separate from identity.
- Admin and Participant capabilities can coexist.
- At most one membership per User + Competition under the approved schema constraint.
- DRAFT removal must preserve historical meaning and permit only approved reapproval behavior.
- The reusable invitation requires login, shows structured rules plus the optional Admin note, and creates no membership until the User requests to join.
- A join request is PENDING until Admin approval; viewing rules is not persisted acceptance in MVP.
- Starting the Competition locks rules and invalidates the invitation; it does not require all Participants to record acceptance.
- A Participant may voluntarily leave only while the Competition is DRAFT; post-start leave is rejected. Admin removal is explicit/audited and preserves history.

## Application use cases

- `inviteParticipant`
- `approveParticipant`
- `removeParticipant`
- `leaveCompetition`
- A reject-participant operation as part of the approved membership-state flow
- `generateInvitationLink` / rotate/revoke invitation
- `viewInvitation`
- `requestToJoin`
- `startCompetition`

## Persistence impact

Complete `CompetitionParticipant` fields, capabilities, state, timestamps, unique `(competitionId, userId)`, status index, and removal audit fields/record where required. Add secure invitation-token hash/revocation/start fields. Use transactions for state changes plus audit when atomicity is required. Preserve and reactivate the same membership row rather than creating duplicate history rows.

## Authorization

- Admin capability is required to invite, approve, reject, or remove within that Competition.
- A Participant may act only on their own join/leave state.
- Cross-Competition and forged participant IDs must be rejected.
- Participant status must not remove or transfer Admin ownership.

## Deliverables

- Membership state/capability domain behavior.
- Authorized Application use cases and safe membership DTOs.
- Persistence migration, queries, audit support, and transactions.
- Admin and participant membership UI.
- Comprehensive authorization and state-transition tests.

## Testing requirements

- Cover anonymous, Participant-only, Admin-only, Admin+Participant, cross-participant, and cross-Competition cases.
- Integration-test uniqueness, preservation, state transitions, and audit actor/time.
- E2E Competition setup: create → invite/join → approve.
- Reuse the M2 create/list/detail routes as the start of that E2E flow; do not
  create parallel Competition setup infrastructure.
- Cover link reuse, authentication redirect/return, rules display before request, revocation, start expiry, and atomic start locking.

## Acceptance criteria

- [ ] Admin can create/rotate/revoke one reusable opaque invitation link.
- [ ] Authenticated invitees see structured rules and Admin note before requesting to join.
- [ ] A join request creates/restores PENDING membership and still requires Admin approval.
- [ ] Admin can approve or reject within their Competition.
- [ ] DRAFT removal preserves the membership record and audit information.
- [ ] Admin + Participant coexistence works.
- [ ] Duplicate and cross-Competition membership actions are rejected.
- [ ] Starting locks Competition rules and invalidates the invitation without requiring persisted Participant acceptance.
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

Do not solve uniqueness by creating duplicate historical memberships. Model capability coexistence without mutually exclusive global roles.

## Open questions

None.
