# Domain rules skill
Use this skill whenever implementing or reviewing scoring, standings, lifecycle, H2H, groups, playoffs, prizes, payments, debt restrictions, or manual resolutions.

Read first:
- `docs/product/product-spec.md`
- `docs/specs/domain-model.md`

Rules:
- Domain is framework-independent.
- Do not duplicate business logic in UI, Server Actions, or SQL.
- Preserve scoring hierarchy and explicit/manual unresolved ties.
- Treat derived values as derived unless a locked spec explicitly says otherwise.
- If the specs do not resolve a product decision, stop and report the ambiguity.
