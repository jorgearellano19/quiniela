---
name: nextjs
description: Implement or review the Quiniela Next.js foundation, including App Router, Server Components and Actions, Better Auth integration, environment boundaries, and frontend architecture.
---

# Next.js foundation skill
Use for Next.js App Router, Server Components/Actions, Better Auth integration, environment boundaries, and frontend architecture.

Read first:
- `AGENTS.md`
- `docs/specs/implementation-spec.md`

Rules:
- Keep the UI thin and server-authoritative.
- Domain must not depend on Next.js, React, Better Auth, Drizzle, HTTP, or browser APIs.
- Use Better Auth minimally for authentication; Competition authorization belongs to Application.
- Do not add React Query/TanStack Query unless actual requirements justify it.
- Never expose server-only secrets or database access to client components.
- Prefer the smallest working foundation over speculative abstractions.
