# M12 — MVP Hardening & Release Readiness

## Status

`FUTURE`

## Goal

Make the completed MVP safe, understandable, accessible, and operationally ready for real Competition use.

## User-visible outcome

Critical flows work reliably on mobile with clear loading, empty, validation, and failure states, and the application is ready for controlled production release.

## In scope

- Critical E2E suite and final acceptance pass for all three Competition types.
- Mobile-first UX, accessibility baseline, loading/empty/error states.
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

- Run the four critical E2E flows from `testing-strategy.md` plus complete paths for each Competition type.
- Run the full domain/application/integration suite against isolated PostgreSQL.
- Verify accessibility baseline, mobile breakpoints, failure/retry states, migration-from-empty, and production build.
- Record actual validation results; never count skipped critical tests as passes.

## Acceptance criteria

- [ ] Critical setup, Round, payment, and playoff E2E flows pass.
- [ ] LEAGUE, LEAGUE_PLAYOFFS, and GROUP_PLAYOFFS pass final acceptance.
- [ ] Authorization/security audit has no unresolved critical finding.
- [ ] Mobile, loading, empty, error, and accessibility baselines pass.
- [ ] Migrations apply cleanly to an empty isolated database.
- [ ] Index/query review confirms no material N+1 or missing required index.
- [ ] Production environment and deployment validation pass.
- [ ] No new feature scope was introduced.
- [ ] Full validation passes without critical skips.

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

Treat M12 as verification and defect correction. Any discovered missing business capability returns to specification/milestone planning rather than entering as hidden hardening scope.

## Open questions

None.

