# M12 — MVP Hardening & Release Readiness

## Status

`COMPLETED — 2026-08-30`

## Goal

Make the completed MVP safe, understandable, accessible, and operationally ready for real Competition use.

## User-visible outcome

Critical flows work reliably on mobile with clear loading, empty, validation, and failure states, and the application is ready for controlled production release.

## In scope

- Critical E2E suite for authentication security and all three Competition types, plus the final acceptance pass.
- Mobile-first UX, accessibility baseline, loading/empty/error states.
- Tailwind semantic-token and source-owned shadcn component consistency review across mobile breakpoints.
- Authorization/security, environment, migration, index/query/N+1, and regression review.
- Deployment readiness and production operational documentation/configuration already justified by the MVP.

## Out of scope

- New product features, Competition types, notifications, external match APIs, online payments, caching platforms, queues, CQRS, or event sourcing.
- Broad refactors without confirmed defects.

## Dependencies

M12 depends on:
- M11

## Relevant specifications

- `docs/product/product-spec.md` complete MVP acceptance boundaries
- `docs/specs/implementation-spec.md` §23–35
- `docs/specs/testing-strategy.md`
- `docs/specs/database-schema.md` §20–25, §27
- `docs/specs/application-use-cases.md` authorization, transaction, idempotency, and time policies

## Relevant skills

- `domain-rules`
- `application`
- `database`
- `nextjs`
- `testing`

## Domain rules / invariants

- Hardening must preserve every approved rule and derived source-of-truth decision.
- Server authorization and time remain authoritative.
- Historical Answers, Results, Payments, and audit records remain protected.
- No final tie is silently resolved and no infrastructure expansion substitutes for correctness.

## Application use cases

No new use cases. Review and validate all implemented MVP queries and mutations.

## Persistence impact

No feature migration is expected. Add or adjust constraints/indexes only for a confirmed integrity/query-plan finding, with reviewed migration and isolated-database verification. No speculative indexing or derived snapshots.

## Authorization

Audit every mutation for anonymous, capability, cross-participant, cross-Competition, and forged-ID denial. Verify sensitive reads, payment privacy, safe errors, session boundaries, and server-only secrets.

## Deliverables

- High-value E2E/regression coverage and acceptance evidence.
- Resolved confirmed security, accessibility, UX, performance, and migration defects.
- Production environment/deployment checklist and validated release configuration.
- Final scope and architecture review.

## Testing requirements

- Run the deferred M1.1 authentication E2E flows (sign-up/sign-in/sign-out, suspension, temporary-password replacement, and rate-limit feedback), the four critical flows from `testing-strategy.md`, and complete paths for each Competition type.
- Run the full domain/application/integration suite against isolated PostgreSQL.
- Verify accessibility baseline, mobile breakpoints, failure/retry states, migration-from-empty, and production build.
- Verify the documented Dockerized local setup from a clean checkout, including separate development/test databases and non-skipped integration tests.
- Record actual validation results; never count skipped critical tests as passes.

## Acceptance criteria

- [x] Critical setup, Round, payment, and playoff E2E flows pass.
- [x] Deferred M1.1 authentication-security E2E flows pass.
- [x] LEAGUE, LEAGUE_PLAYOFFS, and GROUP_PLAYOFFS pass final acceptance.
- [x] Authorization/security audit has no unresolved critical finding.
- [x] Mobile, loading, empty, error, and accessibility baselines pass.
- [x] Migrations apply cleanly to an empty isolated database.
- [x] Index/query review confirms no material N+1 or missing required index.
- [x] Production environment and deployment validation pass.
- [x] No new feature scope was introduced.
- [x] Full validation passes without critical skips.

## Definition of Done

- [x] Scope implemented.
- [x] Out-of-scope functionality was not introduced.
- [x] Approved domain rules preserved.
- [x] Authorization enforced server-side.
- [x] Relevant tests added.
- [x] No duplicated business logic.
- [x] Approved specification corrections recorded.
- [x] lint passes.
- [x] typecheck passes.
- [x] tests pass.
- [x] build passes.
- [x] milestone code review completed.

## Completion evidence

- Documentation was reconciled with the implemented MVP. The invitation contract now
  includes every Competition-level format, scoring, payment, debt, and prize rule while
  preserving unpublished Round privacy.
- Playoff result resolution now crosses an Application use-case boundary. Standings and
  prize queries reuse one Competition aggregate, and Round question hydration is batched
  across rounds, removing the confirmed material N+1 path. Existing foreign-key and lookup
  indexes cover the reviewed access paths; no speculative migration was added.
- Authentication E2E covers sign-up, sign-in, sign-out, persistent rate-limit feedback,
  mandatory temporary-password replacement, and suspension denial. The full browser suite
  contains 13 passing tests with no skips, including all three Competition types.
- Automated WCAG A/AA checks and keyboard skip-link behavior pass at 320, 768, and 1280 px.
  Semantic colors and default touch controls were corrected, and reduced-motion behavior is
  included in the acceptance check.
- Validation passed with Prettier, ESLint, TypeScript, 217 unit tests, 56 isolated PostgreSQL
  integration tests, clean migration into a newly created empty database, 13 Playwright
  tests, and a production webpack build. The temporary migration database was removed.
- Production safeguards reject documented development secrets and non-HTTPS public auth
  origins. README and CI now document trusted proxy headers, migration order, rollback,
  fail-fast E2E configuration, and retained browser artifacts.
- The final closure re-review found and corrected a CI-only configuration conflict: CI now
  generates an ephemeral authentication secret instead of using a production-rejected
  placeholder. Production-equivalent authentication rate limits, the complete 13-test
  browser suite, and the production build were rerun successfully after that correction.

## Risks / implementation notes

Treat M12 as verification and defect correction. Any discovered missing business capability returns to specification/milestone planning rather than entering as hidden hardening scope.

## Open questions

None.
