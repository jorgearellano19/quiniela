# M1 — Authentication

## Status

`READY`

## Goal

Let a person create an account, authenticate, leave a session, and enter a protected application area.

## User-visible outcome

Users can sign up, sign in, remain signed in across requests, view a protected home area, and sign out with safe feedback.

## In scope

- Sign up, sign in, sign out, and server-side session retrieval.
- Auth forms, validation, safe errors, redirects, and protected app shell.
- Authentication-focused tests.

## Out of scope

- Competition membership, authorization, CRUD, invitations, and domain functionality.
- OAuth providers, password recovery, email verification workflow, and user profiles unless separately approved.

## Dependencies

M1 depends on:
- M0

## Relevant specifications

- `docs/product/product-spec.md` §2 and §19
- `docs/specs/implementation-spec.md` §8–10, §15–16, §26, §28
- `docs/specs/testing-strategy.md`

## Relevant skills

- `nextjs`
- `application`
- `testing`

## Domain rules / invariants

- Authentication answers only who the User is; it grants no Competition capability.
- Sessions and secrets remain server-authoritative.
- Safe responses must not leak database errors or stack traces.

## Application use cases

Better Auth operations for sign-up, sign-in, sign-out, and session retrieval. No approved business use case is introduced.

## Persistence impact

Use the existing Better Auth tables. Generate a migration only if the installed Better Auth configuration demonstrably requires a schema correction; do not add product tables.

## Authorization

- Anonymous users may access auth screens but not the protected area.
- Authenticated users may access only their own session.
- Authentication must never be treated as Competition Admin/Participant authorization.

## Deliverables

- Thin auth transport/actions and server-side session helper.
- Mobile-first auth screens and protected shell.
- Safe validation/error presentation.
- Unit and integration tests; focused auth E2E if browser infrastructure is added proportionately.

## Testing requirements

- Cover successful and invalid sign-up/sign-in, sign-out, protected redirects, and session retrieval.
- Verify secrets and internal errors are not exposed.
- Verify authenticated status grants no Competition permission.

## Acceptance criteria

- [ ] A new User can sign up with valid credentials.
- [ ] A User can sign in and retrieve their server-side session.
- [ ] Anonymous access to the protected area is rejected or redirected.
- [ ] A User can sign out and loses protected access.
- [ ] Invalid credentials produce a safe error.
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

Keep Better Auth integration minimal. Do not create a global role or a second user/session model.

## Open questions

None.

