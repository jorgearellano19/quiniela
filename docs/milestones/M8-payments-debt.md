# M8 — Payments & Debt

## Status

`FUTURE`

## Goal

Replace manual spreadsheet debt tracking with Competition-scoped bookkeeping that controls eligibility without destroying predictions.

## User-visible outcome

Participants can see obligations, payments, and balance; Admins can record/correct partial payments and see who is currently restricted.

## In scope

- Optional payment/maximum-debt configuration by Competition type.
- Round fee obligations, participant debt/history, manual full/partial payments, and corrections.
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
- Restriction applies only when balance is strictly greater than `maximumDebt`, and only to open/future Rounds.
- Balance at or below threshold restores eligibility automatically.
- Restrictions never delete Answers or alter FINALIZED history.
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

Add `PaymentObligation`, `Payment`, relevant Competition payment fields, and Round prize configuration needed here, with approved unique/index/FK constraints and UTC audit fields. Recording/correcting a payment plus audit is transactional. Do not persist current debt or restriction.

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

- Cover obligations, partial/multiple/corrected payments, threshold equality, restriction/restoration, and finalized-history preservation.
- Property-test monotonic balance reduction for valid positive payments where practical.
- Integration-test uniqueness, atomic payment+audit, actor/time, and Answer preservation.
- E2E obligation → debt view → payment → automatic eligibility update.

## Acceptance criteria

- [ ] Payments can be enabled/configured only as approved for Competition type.
- [ ] Obligation and payment history derive the correct balance.
- [ ] Admin records and audits full/partial payments and corrections.
- [ ] Restriction applies only above threshold to open/future Rounds.
- [ ] Sufficient payment automatically restores Answer eligibility.
- [ ] Answers and finalized scoring are preserved.
- [ ] No online-payment feature or authoritative debt column exists.
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

Eligibility must be evaluated at score/query time so correction or payment immediately affects open-round scoring without rewriting Answers.

## Open questions

`database-schema.md` explicitly leaves allocation semantics for partial payments covering multiple obligations unresolved and requires them before final migration design. Resolve whether/how payments allocate across obligations before implementing M8 persistence.

