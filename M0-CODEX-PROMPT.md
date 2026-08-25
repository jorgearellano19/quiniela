# M0 — Foundation

Read `AGENTS.md`, then all relevant `.codex/skills/*/SKILL.md` files, then the approved
documents under `docs/` before changing code.

Inspect the repository first. Do not modify locked documentation. If a material ambiguity
or contradiction exists, stop and report it instead of inventing a rule.

Implement only the technical foundation: Next.js App Router, strict TypeScript, Drizzle +
PostgreSQL/Neon, migrations, minimal Better Auth, environment validation,
lint/format/typecheck, unit/integration test infrastructure, basic error foundation, CI
validation if appropriate, and clear architecture boundaries.

Do not implement Competition, Participants, Invitations, Rounds, Questions, Answers,
Scoring, Standings, H2H, Groups, Playoffs, Payments, Prizes, notifications, external match
APIs, online payments, Redis, queues, CQRS, event sourcing, or speculative
caching/state-management infrastructure.

Use `database-schema.md` as the schema source of truth. Do not invent tables. Better Auth
owns its required authentication tables. Competition-scoped authorization is not part of
Better Auth and will be implemented later in Application.

At the end actually run the repository's commands for format/check, lint, typecheck, unit
tests, integration tests, and build. Do not claim success without execution.

Final report must include: Summary, Files Changed, Architecture, actual Validation
results, Known Issues, Open Questions, and Next Recommended Milestone. Do not implement
the next milestone.
