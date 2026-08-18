# Testing skill
Use whenever changing business logic, persistence constraints, authorization, lifecycle, scoring, playoffs, or payments.

Read first:
- `docs/specs/testing-strategy.md`
- relevant domain/application specs.

Rules:
- Prefer domain unit tests, then targeted integration tests, then a few E2E flows.
- Every bug gets a regression test at the lowest appropriate layer.
- Never weaken/delete a valid test merely to make implementation pass.
- Verify authorization on every mutation.
- Never use production Neon data for tests.
- Before completion run format, lint, typecheck, unit tests, integration tests, and build.
