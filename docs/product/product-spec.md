# Quiniela App — Product Spec (MVP)

> Approved product contract. Last updated: 2026-08-13. This version supersedes previous drafts.

## 1. Purpose
Mobile-first web/PWA for football prediction competitions. It replaces the Admin workflow of Excel + WhatsApp while keeping the Admin as owner. It includes predictions, scoring, standings, H2H, playoffs, and optional manual payment/debt tracking. It is not a payment processor.

## 2. Users and ownership
A global User can belong to multiple Competitions. Admin authorization is scoped to a Competition. A user may be Admin and Participant in the same Competition. While a Competition is DRAFT, the Admin may remove a participant who joined, including accidentally.

## 3. Competition types
### LEAGUE
No H2H. Prediction Scores accumulate across rounds. Highest final Prediction Score wins. League tiebreaker #1 is EXACT_SCORE points DESC.

### LEAGUE_PLAYOFFS
Regular phase is H2H, all participants play each other. Maximum 30 participants. Number of regular-phase rounds is configurable, maximum N-1. No groups. After the regular phase, playoffs are played.

### GROUP_PLAYOFFS
Allowed participant counts: 8, 16, 32, 64. Group size is 4 or 8. One or two participants may advance from each group according to configuration, producing playoff fields of 4, 8, 16, or 32.

## 4. Competition lifecycle
Competition starts in DRAFT. Once participants accept the rules and the Admin starts the Competition, competition rules are locked.

## 5. Round lifecycle
`DRAFT -> PUBLISHED -> ACTIVE -> FINISHED -> FINALIZED`.

DRAFT: Questions and scoring rules are editable. PUBLISHED: Questions cannot be added/changed and scoring rules are frozen. FINISHED means all required Official Results exist and starts a 24-hour correction window. During the window the Admin may edit Official Results; affected derived scores/standings update immediately. After 24 hours the round becomes FINALIZED and Official Results are immutable.

## 6. Questions and Answers
Questions belong to a Round. Match Questions use typed columns `homeScore` and `awayScore`. Answers are never deleted because of payment restrictions. A Playoff Round cannot have Answers before publication.

## 7. Match scoring
Match scoring is hierarchical, not cumulative: 1) EXACT_SCORE, 2) GOAL_DIFFERENCE if enabled for the Competition, 3) NORMAL_RESULT. If a higher rule succeeds, lower rules do not award additional points.

EXACT_SCORE requires both homeScore and awayScore to match. GOAL_DIFFERENCE uses signed `homeScore - awayScore`, applies only to Home/Away wins, and requires the prediction to match both difference and direction. Example official 3-1: 2-0 and 4-2 qualify; 0-2 does not. Draws do not qualify. NORMAL_RESULT predicts Home win, Draw, or Away win.

## 8. Other scoring
`CLOSEST_VALUE` awards the point to the closest prediction. When `againstRival=true` and H2H applies: exact prediction wins; otherwise the closer prediction wins; if both non-exact predictions have equal distance, neither wins.

## 9. Unanswered questions
MVP supports an unanswered-question penalty. Default is -1; Admin may configure 0. An unanswered Tiebreaker Question always yields 0.

## 10. Answer editing
The server decides editability. The client must not expose an editing state or the reason an Answer is no longer editable.

## 11. Prediction Score and H2H Points
Prediction Score is derived from Answers, Official Results, scoring rules, penalties, and applicable restrictions. MVP does not persist score snapshots as a second source of truth. Prediction Score and H2H Points are distinct.

H2H/Group standings tiebreak order: 1) H2H Points DESC, 2) Prediction Score DESC, 3) EXACT_SCORE DESC, 4) More H2H wins.

## 12. Tiebreaker Questions
A Tiebreaker Question only counts when participants are tied in the relevant score. `tiebreakerQuestionId` belongs to each Playoff Round. All Matchups in that round use the same question; different rounds may use different questions. If it still leaves a complete tie, Admin resolves manually.

## 13. Playoffs
Each Playoff Round independently configures Scoring Rules, Tiebreaker Question, and Advancement Mode. Advancement Mode is BEST_SEED or TIEBREAKER_QUESTION. These settings are editable until the round is published and frozen afterward.

For ranking-based seeding: Prediction Score DESC, then EXACT_SCORE DESC, then Admin resolves any remaining tie. For GROUP_PLAYOFFS group advancement/seeding: H2H Points DESC; remaining tie is Admin-resolved.

## 14. Payment tracking
Payments are optional per Competition and are manual tracking only. No Stripe, PayPal, Mercado Pago, checkout, wallet, card processing, payment links, bank integrations, payment webhooks, financial ledger, or automatic prize settlement. Admin retains ownership.

### LEAGUE
Optional: round fee and round-winner prize.

### LEAGUE_PLAYOFFS
Optional: round fee, round-winner prize, league-phase winner prize, playoff-champion prize.

### GROUP_PLAYOFFS
Optional: playoff-champion prize.

Admin configures each prize amount directly. The app may show the winner and configured prize amount but does not track whether the prize was physically paid.

A round fee creates an obligation per applicable participant. Admin can record full or partial payments and correct payment records. Participants see their own amount owed, amount paid, and outstanding balance. Admin sees and manages participant payment status.

## 15. Debt restriction
If enabled, Admin configures `maximumDebt`. If outstanding balance exceeds it, Admin may restrict the participant. Restriction affects only open and future rounds. Finalized rounds are never retroactively invalidated. Answers are not deleted. While restricted, affected Answers do not count toward scoring.

When Admin records a payment that brings balance to `maximumDebt` or below, the participant is automatically enabled and affected Answers count again. No separate unblock action is required.

## 16. Payment winner rules
Round winner: 1) Prediction Score DESC, 2) Match Question points DESC, 3) total Prediction Score accumulated across the League phase DESC, 4) earlier Answer submission time ASC. If still tied, Admin resolves manually. Match Question points means points from Questions containing homeScore and awayScore.

LEAGUE_PLAYOFFS league-phase winner: 1) Prediction Score DESC, 2) EXACT_SCORE points DESC, 3) H2H among tied participants when applicable. If H2H does not produce one winner, Admin resolves manually.

Playoff prize winner is the official playoff champion.

## 17. Time
Competition has no timezone. Store timestamps in UTC and compare deadlines in UTC. Present timestamps in the user's local timezone.

## 18. Auditability
Important administrative mutations record `updatedAt` and `updatedBy`, including Official Result changes, manual tie resolutions, payment creation/correction, payment restrictions, and other sensitive configuration changes.

## 19. Authentication and architecture constraints
Use Better Auth minimally. Use Next.js App Router, Server Actions, Drizzle, PostgreSQL, and Neon initially. Supabase is an alternative provider, not a required dependency. Authorization is Competition-scoped.

## 20. MVP principles
Keep infrastructure and dependencies minimal. Prefer derived scores over duplicated sources of truth. Do not implement V2 features early. Do not create new product/architecture documents when an existing document can be updated.

## 21. Explicitly out of scope
Online payment processing, automatic prize settlement, WhatsApp/email/push notifications, Survivor mode, advanced accounting, financial ledgers, and future competition modes not approved for MVP.
