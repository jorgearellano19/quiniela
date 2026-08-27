# M8 — Payments & Debt

## Status

`COMPLETED — 2026-08-27`

## Goal

Replace manual spreadsheet debt tracking with Competition-scoped bookkeeping that controls eligibility without destroying predictions.

## User-visible outcome

Participants can see obligations, payments, and balance; Admins can record/correct partial payments and see who is currently restricted.

## In scope

- Optional payment/maximum-debt configuration by Competition type.
- Round fee obligations, participant debt/history, manual full/partial participant-level payments, overpayment credit, and corrections.
- Derived balance, restriction for open/future Rounds, and automatic restoration.
- Participant debt view, Admin overview, audit, and Round winner/prize association needed by payment flow.

## Out of scope

- Checkout, cards, wallets, payment links, processors, webhooks, automatic reconciliation/transfer, or financial ledger.
- Prize payout status and retroactive invalidation/deletion of Answers.
- Final non-Round prize behavior, completed in M11.

## Dependencies

M8 depends on:
- M3
- M5
- M7

## Relevant specifications

- `docs/product/product-spec.md` §14–18, §21
- `docs/specs/domain-model.md` payments, debt, restrictions, and Round winner sections
- `docs/specs/database-schema.md` §3, §15–19, §22–24, §26
- `docs/specs/application-use-cases.md` §16 and §18
- `docs/specs/implementation-spec.md` §13, §19–21, §28–30
- `docs/specs/testing-strategy.md`

## Relevant skills

- `domain-rules`
- `application`
- `database`
- `nextjs`
- `testing`

## Domain rules / invariants

- Balance is obligations minus recorded payments; current debt/restriction is not authoritative persisted state.
- Payments are not allocated to obligations; a negative balance is allowed credit.
- Competition currency is immutable, defaults to MXN, and amounts use integer minor units.
- Restriction applies only when balance is strictly greater than `maximumDebt`, and only to open/future Rounds.
- Balance at or below threshold restores eligibility automatically.
- Restrictions never delete Answers or alter FINALIZED history.
- Restriction applies through the FINISHED correction window; at effective FINALIZED, preserved Answers participate in the finalized result and later debt changes cannot alter it.
- Payments are manual bookkeeping; prizes are separate configured amounts.

## Application use cases

- `configurePayments`
- `createPaymentObligation`
- `getMyDebt`
- `getCompetitionPaymentStatus`
- `recordPayment`
- `updatePayment`
- `getPaymentWinner`

## Persistence impact

Add `PaymentObligation`, participant-level `Payment`, relevant Competition payment fields, and Round prize configuration needed here, with approved unique/index/FK constraints, integer-minor-unit amounts, and UTC audit fields. Recording/correcting a payment plus audit is transactional. Do not persist allocation, current debt, or restriction.

## Authorization

- Competition Admin configures, creates obligations, records/corrects, and views Competition status.
- Participant sees only their own detailed payment data.
- Answer eligibility is recomputed server-side from the authenticated participant and current balance.
- Anonymous, cross-participant, and cross-Competition access is rejected.

## Deliverables

- Pure balance/restriction and Round payment-winner logic.
- Authorized payment use cases and safe participant/Admin DTOs.
- Schema migration, transactions, audit, and derived queries.
- Participant debt and Admin bookkeeping UI; Answer eligibility integration.
- Domain, integration, authorization, audit, and critical-flow E2E tests.

## Testing requirements

- Cover obligations, partial/multiple/corrected payments, overpayment credit, threshold equality, restriction/restoration, and finalized-history preservation.
- Property-test monotonic balance reduction for valid positive payments where practical.
- Integration-test uniqueness, atomic payment+audit, actor/time, and Answer preservation.
- E2E obligation → debt view → payment → automatic eligibility update.

## Acceptance criteria

- [x] Payments can be enabled/configured only as approved for Competition type.
- [x] Obligation and payment history derive the correct balance.
- [x] Payments remain participant-level, overpayment produces credit, and no allocation model is introduced.
- [x] Admin records and audits full/partial payments and corrections.
- [x] Restriction applies only above threshold to open/future Rounds.
- [x] Sufficient payment automatically restores Answer eligibility.
- [x] Answers and finalized scoring are preserved.
- [x] No online-payment feature or authoritative debt column exists.
- [x] Relevant tests, lint, typecheck, and build pass.

## Definition of Done

- [x] Scope implemented.
- [x] Out-of-scope functionality was not introduced.
- [x] Approved domain rules preserved.
- [x] Authorization enforced server-side.
- [x] Relevant tests added.
- [x] No duplicated business logic.
- [x] No locked specification modified outside the approved M8 clarification revision.
- [x] lint passes.
- [x] typecheck passes.
- [x] tests pass.
- [x] build passes.
- [x] milestone code review completed.

## Risks / implementation notes

Eligibility must be evaluated at score/query time so correction or payment immediately affects open-round scoring without rewriting Answers.

## Open questions

Resolved during planning on 2026-08-27: restriction is automatic and derived; Round publication atomically creates obligations; restricted open Rounds are read-only and contribute zero including no unanswered penalty; `maximumDebt` is optional; payment configuration freezes at Competition start; `paidAt` may be past/present only; corrections edit the effective Payment row plus append immutable before/after audit; and M8 implements only Round-winner prize configuration.

Clarified during regression review on 2026-08-27: open-Round restriction includes the FINISHED correction window; at effective FINALIZED, preserved Answers participate in finalized scoring, which then remains unaffected by later debt changes.

Validation completed on 2026-08-27: formatting, lint, typecheck, 154 unit tests,
40 PostgreSQL integration tests, 2 mobile Chromium E2E tests, migration
application to isolated development/test databases, and the optimized Next.js webpack
build passed. The default Turbopack build retains the known restricted-environment CSS
worker port-binding failure documented in M7; webpack validated every route including the
new payments route.
