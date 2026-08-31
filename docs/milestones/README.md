# Quiniela MVP Milestones

These files are delivery contracts. Locked product and implementation specifications remain authoritative if a milestone summary conflicts with them.

| Milestone | Name | Status | Depends On | Outcome |
| --- | --- | --- | --- | --- |
| M0 | Foundation | COMPLETED | — | Reproducible local and CI technical foundation |
| M1 | Authentication | COMPLETED | M0 | End-user authentication |
| M1.1 | Authentication Security | COMPLETED | M1 | Secure recovery and platform operations |
| M2 | Competition | COMPLETED | M1.1 | Admin creates and manages a Competition |
| M3 | Participants & Membership | COMPLETED | M2 | Contextual membership and authorization |
| M4 | Rounds & Questions | COMPLETED | M3 | Admin publishes a playable Round |
| M5 | Answers | COMPLETED | M4 | Participants submit and edit predictions |
| M6 | Official Results & Scoring | COMPLETED | M5 | Results produce authoritative scores |
| M7 | Standings & Winners | COMPLETED | M6 | Scores become rankings and winners |
| M8 | Payments & Debt | COMPLETED | M7 | Manual debt tracking and eligibility |
| M9 | H2H & Groups | COMPLETED | M7 | H2H phases and group qualification |
| M10 | Playoffs | COMPLETED | M9 | Playoff bracket through champion |
| M11 | Prizes & Competition Completion | COMPLETED | M8, M10 | Final winners and configured prizes |
| M12 | MVP Hardening & Release Readiness | COMPLETED | M11 | Production-ready MVP |

The roadmap retains the base M0–M12 sequence and inserts M1.1 as the approved security prerequisite for M2. M8 and M9 can proceed independently after M7, but both are required before M11. The 2026-08-20 specification revision also locks platform-operation, recovery, and authentication-abuse decisions. Remaining open items are implementation decisions unless a milestone explicitly says otherwise.

## Execution workflow

`PLAN → APPROVE PLAN → IMPLEMENT → VALIDATE → REVIEW → CLOSE MILESTONE`

A milestone must not automatically start the next milestone.

### Phase A — Plan

Codex must read `AGENTS.md`, this milestone contract, its listed skills, and only the relevant locked specifications; inspect the current implementation; produce an implementation plan; and identify blocking ambiguities. **No code changes.**

### Phase B — Implement

Only after plan approval, implement only the milestone scope, preserve architecture boundaries, add required tests, and run focused and full validation.

### Phase C — Review

Review against `AGENTS.md`, the milestone, relevant locked specifications, and the testing strategy. Check domain rules, authorization, duplicated logic, persistence and migration safety, transactions, tests, scope creep, and unnecessary abstractions. Fix only confirmed issues.

### Phase D — Close

Mark a milestone `COMPLETED` only when its Definition of Done passes. Do not begin the next milestone automatically.
