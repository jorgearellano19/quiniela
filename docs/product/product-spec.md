# Quiniela App — Product Spec (MVP)

> Approved product contract. Last updated: 2026-08-26. This revision additionally defines platform operation, operator-assisted recovery, authentication abuse controls, and Answer editing boundaries.

## 1. Purpose
Mobile-responsive web application for football prediction competitions. It replaces the Admin workflow of Excel + WhatsApp while keeping the Admin as owner. It includes predictions, scoring, standings, H2H, playoffs, and optional manual payment/debt tracking. It is not a payment processor.

## 2. Users, ownership, and joining
A global User can belong to multiple Competitions. Admin authorization is scoped to a Competition. The creator is initialized as both Admin and ACTIVE Participant. Admin capability remains independent of participant status. While a Competition is DRAFT, the Admin may remove a participant who joined, including accidentally, and an ACTIVE Participant may voluntarily leave. Rejected and removed users may request again only through a valid invitation.

For MVP, an Admin generates a reusable, opaque Competition invitation link. The link remains valid until the Competition starts and may be revoked earlier by the Admin. Opening it requires authentication. After authentication, the User sees the Competition rules and submits a join request. The request creates a `PENDING` membership; the Admin must approve it before the User becomes an `ACTIVE` Participant.

The rules view contains both a structured summary of Competition configuration and an optional Admin-authored rules note. Viewing the rules before submitting the request is required, but MVP does not persist rule acceptance, require every Participant to accept before Competition start, or invalidate requests when DRAFT rules change.

## 3. Competition types
### LEAGUE
No H2H. Prediction Scores accumulate across rounds. Highest final Prediction Score wins. League tiebreaker #1 is EXACT_SCORE points DESC.

### LEAGUE_PLAYOFFS
Regular phase is H2H, all participants play each other. Maximum 30 participants. Number of regular-phase rounds is configurable, maximum N-1. No groups. After the regular phase, playoffs are played.

### GROUP_PLAYOFFS
Allowed participant counts: 8, 16, 32, 64. Group size is 4 or 8. One or two participants may advance from each group according to configuration, producing playoff fields of 4, 8, 16, or 32.

## 4. Competition lifecycle
Competition lifecycle is `DRAFT → STARTED → COMPLETED`, with explicit Admin start and completion actions. Starting invalidates the invitation link and locks Competition rules. MVP does not require every active Participant to record a separate rules acceptance before start. Participants may voluntarily leave only while the Competition is DRAFT; they cannot leave after it starts. Admin removals are explicit and audited and preserve historical records.

Starting requires no pending requests and a playable ACTIVE roster: at least 1 for LEAGUE, 2–30 for LEAGUE_PLAYOFFS, and exactly 8, 16, 32, or 64 for GROUP_PLAYOFFS. Starting freezes the roster. The Admin may complete a Competition only when its required regular Rounds/phases are effectively FINALIZED and its required final winner is resolved: the League winner for LEAGUE, or the Playoff Champion for LEAGUE_PLAYOFFS/GROUP_PLAYOFFS. COMPLETED preserves read-only historical results and locks remaining administrative configuration.

## 5. Round lifecycle
`DRAFT -> PUBLISHED -> ACTIVE -> FINISHED -> FINALIZED`.

DRAFT: Questions and scoring rules are editable. Publishing the Round atomically performs `DRAFT → PUBLISHED → ACTIVE`: PUBLISHED freezes its Questions/scoring rules and ACTIVE opens its Questions for Answers. Each Question closes at its absolute deadline. A separate activation action is not required for MVP. FINISHED begins automatically when all required Official Results exist and starts a 24-hour correction window. During the window the Admin may edit Official Results; affected derived scores/standings update immediately. At `finishedAt + 24 hours`, the Round is effectively FINALIZED by server-authoritative time without requiring a background worker or Admin action, and Official Results are immutable.

## 6. Questions and Answers
`MATCH_SCORE` uses home and away labels and has no separate prompt; every other type
requires a prompt. Each Round defines a start used as its default answer deadline, and each
Question closes either then or at an absolute custom deadline. Competition Admins configure
typed scoring defaults per Question type. A DRAFT Question may inherit current defaults or
override them. Defaults remain editable after Competition start for future DRAFT Questions;
publication snapshots effective scoring so published Rounds never change retroactively.

Questions belong to either a regular Round or a Playoff Round. MVP Question types are:

- `MATCH_SCORE`: numeric `homeScore` and `awayScore` prediction and Official Result.
- `CLOSEST_VALUE`: numeric prediction and Official Result. Without `againstRival`, the closest participant or participants in the applicable Round scope receive the configured point; every participant tied at the closest distance receives it. With `againstRival`, the approved H2H rule applies.
- `OPTIONS`: one selection from multiple configured options; one official correct option.
- `OPEN_TEXT`: free-text Answer; the Admin manually marks each Answer correct or incorrect.
- `EXACT_VALUE`: numeric Answer that scores only when it exactly matches the Official Result.

Question data, Answers, and Official Results are typed. Answers are never deleted because of payment restrictions. A Playoff Round cannot have Answers before publication. All participants in a Playoff Round answer the same Questions and share the same Official Results, while Answers remain participant-specific.

Every submitted `OPEN_TEXT` Answer must receive an Admin correct/incorrect judgment before all required Results are considered complete and the parent Round can automatically enter FINISHED.

An Admin may first record a Result or judge an `OPEN_TEXT` Answer only at or after that
Question's deadline. Existing Results and judgments remain correctable while the Round is
ACTIVE or within its FINISHED correction window; every real correction is audited. They
become immutable at effective FINALIZED. `OPEN_TEXT` has no empty shared Official Result:
a closed Question is result-complete when every submitted Answer is judged, and a closed
Question with no submitted Answers is complete.

## 7. Match scoring
Match scoring is hierarchical, not cumulative: 1) EXACT_SCORE, 2) GOAL_DIFFERENCE if enabled for the Competition, 3) NORMAL_RESULT. If a higher rule succeeds, lower rules do not award additional points.

EXACT_SCORE requires both homeScore and awayScore to match. GOAL_DIFFERENCE uses signed `homeScore - awayScore`, applies only to Home/Away wins, and requires the prediction to match both difference and direction. Example official 3-1: 2-0 and 4-2 qualify; 0-2 does not. Draws do not qualify. NORMAL_RESULT predicts Home win, Draw, or Away win.

## 8. Other scoring
`CLOSEST_VALUE` awards the point to the closest prediction. When `againstRival=true` and H2H applies: exact prediction wins; otherwise the closer prediction wins; if both non-exact predictions have equal distance, neither wins.

## 9. Unanswered questions
MVP supports an unanswered-question penalty. Default is -1; Admin may configure 0. An unanswered Tiebreaker Question always yields 0.

## 10. Answer editing
The server decides editability. The client may receive a safe capability such as `canEdit`,
but must not receive or expose the internal reason an Answer is no longer editable. Answers
save one Question at a time. A saved Answer may be edited while allowed but is not deleted
back to unanswered in MVP.

`OPEN_TEXT` Answers are trimmed, nonblank, and limited to 500 characters.
`CLOSEST_VALUE` and `EXACT_VALUE` accept signed decimal values with up to six decimal
places; excess precision is rejected rather than rounded. Published scoring values may be
shown with the Question without calculating a score.

## 11. Prediction Score and H2H Points
Prediction Score is derived from Answers, Official Results, scoring rules, penalties, and applicable restrictions. MVP does not persist score snapshots as a second source of truth. Prediction Score and H2H Points are distinct.

Before all Results exist, a partial Prediction Score includes only result-complete
Questions. The unanswered penalty begins contributing when its Question becomes
result-complete, not merely when its deadline passes.

Before a Question deadline, Participants may see only their own prediction. At and after
the deadline, authorized Competition Participants may see every Participant's prediction
or unanswered state, the Official Result when present, and the derived Question points.
This review does not create standings, positions, or winner selection.

H2H/Group standings tiebreak order: 1) H2H Points DESC, 2) Prediction Score DESC, 3) EXACT_SCORE DESC, 4) More H2H wins.

Each regular H2H Round pairs a Participant with one opponent. The Participant with the higher Prediction Score for that Round receives 3 H2H Points and the opponent receives 0. If their Prediction Scores tie, each receives 1 H2H Point. `LEAGUE_PLAYOFFS` round-robin matchups are generated by the system; an odd participant count produces one bye per schedule slot. `GROUP_PLAYOFFS` group membership is assigned manually by the Admin, after which the system generates round-robin matchups within each group.

## 12. Tiebreaker Questions
A Tiebreaker Question only counts when participants are tied in the relevant score. `tiebreakerQuestionId` belongs to each Playoff Round. All Matchups in that round use the same question; different rounds may use different questions. If it still leaves a complete tie, Admin resolves manually.

## 13. Playoffs
Each Playoff Round independently configures Scoring Rules, Tiebreaker Question, and Advancement Mode. Advancement Mode is BEST_SEED or TIEBREAKER_QUESTION. These settings are editable until the round is published and frozen afterward.

Playoff Rounds use the same Question, Answer, Official Result, deadline, publication, automatic finish, 24-hour correction, and effective finalization behavior as regular Rounds. They occur after the `LEAGUE_PLAYOFFS` round-robin phase or `GROUP_PLAYOFFS` group phase.

Ranking-based seeding is: Prediction Score DESC, then EXACT_SCORE DESC, then Admin resolves any remaining tie. The bracket pairs the highest remaining seed with the lowest (`1 vs 16`, `2 vs 15`, and so on). Group standings and advancement use the full H2H order in §11 before Admin resolution. `BEST_SEED` means that when a Playoff Matchup remains tied on its H2H Prediction Score, the better seed advances. `TIEBREAKER_QUESTION` evaluates the shared Playoff Round tiebreaker Question instead; a remaining tie requires Admin resolution.

## 14. Payment tracking
Payments are optional per Competition and are manual tracking only. No Stripe, PayPal, Mercado Pago, checkout, wallet, card processing, payment links, bank integrations, payment webhooks, financial ledger, or automatic prize settlement. Admin retains ownership.

### LEAGUE
Optional: round fee, round-winner prize, and league-winner prize.

### LEAGUE_PLAYOFFS
Optional: round fee, round-winner prize, league-phase winner prize, playoff-champion prize.

### GROUP_PLAYOFFS
Optional: playoff-champion prize.

Admin configures each prize amount directly. The app may show the winner and configured prize amount but does not track whether the prize was physically paid.

A round fee creates an obligation per applicable participant. Admin can record full or partial payments and correct payment records. Payments are participant-level contributions and are not allocated to individual obligations. Participants see their own amount owed, amount paid, and outstanding balance. Admin sees and manages participant payment status. Overpayment is allowed and appears as a credit balance.

Each Competition uses one immutable currency, defaulting to `MXN`. Monetary amounts are stored in integer minor units.

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

The global Better Auth `platform_operator` role exists only for account support and never grants Competition capability. Operators may perform exact-email lookup, suspend/restore accounts, revoke sessions, issue server-generated temporary passwords after manual verification, and view authentication-security events. They may not browse users, impersonate, delete users, change roles through the UI, choose permanent passwords, or access private Competition data.

MVP password recovery is operator-assisted because email delivery is not included. A temporary password expires after 15 minutes, revokes existing sessions, and permits access only to mandatory password replacement. Suspended accounts cannot authenticate. Credential endpoints are persistently rate-limited and return safe, non-enumerating errors. Email delivery, backup codes, 2FA, CAPTCHA, and authentication E2E coverage are deferred.

Local development uses Dockerized PostgreSQL and must not require a Neon database. The mobile-responsive UI foundation uses Tailwind CSS and source-owned shadcn/ui components added incrementally. Server Components remain the default; Client Components are limited to required interactivity. Installable/offline PWA behavior is not required for MVP.

## 20. MVP principles
Keep infrastructure and dependencies minimal. Prefer derived scores over duplicated sources of truth. Do not implement V2 features early. Do not create new product/architecture documents when an existing document can be updated.

## 21. Explicitly out of scope
Online payment processing, automatic prize settlement, WhatsApp/email/push notifications, Survivor mode, advanced accounting, financial ledgers, and future competition modes not approved for MVP.
