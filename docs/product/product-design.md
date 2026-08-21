# Quiniela product design and content guide

**Status:** CANONICAL — 2026-08-20

## 1. Purpose and authority

This guide is the internal contract for Quiniela interface design, visual styling, and user-facing content. Read it before creating or modifying UI. Approved product, domain, security, and architecture rules take precedence: a visual decision must never change behavior, permissions, or business rules.

Quiniela is a mobile-first application for creating and joining prediction competitions. It should feel sports-oriented without depending on one sport, editorial without becoming formal, and competitive without becoming childish or aggressive.

The audience is adult in tone and clarity. This does not imply an 18+ restriction, and the product must not suggest one.

## 2. Identity and voice

### Personality

- **Competitive:** every prediction has weight and results matter.
- **Editorial:** clear hierarchy, characterful headlines, and deliberate composition.
- **Direct:** short sentences, concrete instructions, and unambiguous actions.
- **Approachable:** address the person as “tú”, without condescension or artificial enthusiasm.
- **Multipurpose:** avoid football-only language about pitches, goals, or scorelines unless the content is specifically about a match.

### Brand and terminology

- **Quiniela** names the brand and is capitalized.
- **quiniela** names each competition a person creates: “tu quiniela”, “crear una quiniela”.
- Use **competencia** when it clarifies a rule, distinguishes the concept, or avoids repetition.
- **pronóstico:** a prediction submitted by a participant.
- **pregunta:** the unit that receives a prediction and later an official result.
- **resultado:** official data used to evaluate predictions.
- **ronda:** a published set of questions in a quiniela.
- **posición:** a place in a table or classification.
- **empate:** an equality resolved by approved rules or an explicit manual decision.
- **clasificación:** the order produced by scores or points; prefer it to “ranking” in UI copy.

### Spanish and inclusive writing

User-facing content uses Mexican Spanish. Prefer natural neutral constructions such as “quienes participan”, “la persona”, and “tu cuenta”. Do not use `@`, `x`, `e`, or unnecessary generic masculine forms. Do not duplicate genders when a neutral phrase is clearer.

Do not translate technical identifiers in code, but never expose them directly when a clear label exists.

## 3. Content rules

### Titles and help text

- A title states the purpose or outcome of the screen: “Vuelve a competir”, “Seguridad de tu cuenta”.
- Use sentence case, no trailing period, and normally no more than eight words.
- Supporting copy explains the next step; it does not repeat the title or reveal internal state reasons.
- Keep paragraphs short and focused on one main idea.

### Buttons and links

- Start buttons with a specific verb: “Iniciar sesión”, “Guardar contraseña”, “Revocar sesión”.
- Reserve “Aceptar” or “Continuar” for cases where the action is already clear from context.
- Pending text retains the action's meaning: “Guardando…”, “Buscando…”. Use the `…` character.
- Link copy describes its destination; avoid “haz clic aquí”.
- Destructive or sensitive actions must be explicit and must not rely on color alone.

### Validation, errors, and confirmation

- Every field has a visible label. A placeholder is an example, never a label.
- Validation explains what to fix beside the field and provides a summary when appropriate.
- An error says what could not be completed and, when safe, how to proceed. Do not blame the person or expose internal details, account existence, or authorization rules.
- A confirmation names the outcome: “Sesión revocada”. Do not use “Éxito”.
- Dynamic messages use `role="alert"` for urgent errors and `role="status"` for informational outcomes.

### Empty states

An empty state answers what is absent, why that can be expected, and what happens or can be done next. Do not frame an expected absence as an error. Example: “Aún no tienes quinielas. Cuando participes en una, aparecerá aquí.”

### Dates, time, and numbers

- Display dates with the `es-MX` locale in the person's local time zone; persisted data remains UTC.
- Prefer readable date and time, such as “20 ago 2026, 14:35”, over ambiguous numeric-only formats.
- Format numbers and currencies with `Intl.NumberFormat("es-MX")`.
- Keep values with their units; do not round scores or money without a product rule.

## 4. Light visual system

### Direction

The visual direction is **sports editorial**: large serif headlines, functional sans-serif UI, ivory surfaces, deep green, and a restrained competitive accent. Energy comes from contrast, rhythm, and hierarchy rather than sport-specific illustrations or decoration.

### Typography

- Headlines use `--font-heading`: Iowan Old Style, Palatino, and Georgia fallbacks.
- Body and UI use `--font-sans`: Avenir Next, Avenir, and Segoe UI fallbacks.
- Keep body text comfortably sized. Do not set paragraphs in uppercase. Editorial eyebrow labels are brief, uppercase, and widely tracked.

### Palette and tokens

Keep the existing semantic token names. These are the canonical light-theme values:

| Token | OKLCH value | Purpose |
| --- | --- | --- |
| `--background` | `oklch(0.974 0.013 91.5)` | overall ivory |
| `--foreground` | `oklch(0.235 0.025 155)` | charcoal-green text |
| `--card`, `--popover` | `oklch(0.995 0.007 91.5)` | raised surfaces |
| `--primary` | `oklch(0.31 0.083 153)` | deep brand green |
| `--primary-foreground` | `oklch(0.974 0.013 91.5)` | text on green |
| `--secondary` | `oklch(0.92 0.035 91.5)` | warm secondary surface |
| `--muted` | `oklch(0.94 0.02 91.5)` | quiet backgrounds |
| `--muted-foreground` | `oklch(0.48 0.025 155)` | secondary text |
| `--accent` | `oklch(0.9 0.05 91.5)` | warm emphasis |
| `--destructive` | `oklch(0.55 0.19 28)` | error and risk |
| `--border`, `--input` | `oklch(0.855 0.025 91.5)` | boundaries and fields |
| `--ring` | `oklch(0.48 0.09 153)` | visible focus |

The visible competitive accent in `.match-dot` uses `--destructive` ornamentally. It must not become a ball, goal, or sport-specific reference.

### Spacing, shape, and elevation

- Use Tailwind's spacing scale and `gap` compositions. Use arbitrary values only for a deliberate editorial decision.
- Design from 320 px upward. Main content starts with 16 px mobile gutters and increases progressively.
- The base radius is `--radius: 0.7rem`. Standard cards use `rounded-xl`; primary editorial surfaces may use `rounded-3xl`.
- Borders are thin and semantic. Do not stack borders, shadows, and background changes without a hierarchy purpose.
- Elevation is restrained. Authentication cards may use the documented soft green shadow; other surfaces prefer a border and surface contrast.

### Iconography and motion

- Use the configured Lucide library with consistent stroke and recognizable meaning.
- Decorative icons use `aria-hidden="true"`; icon-only buttons require an accessible name.
- Do not use football-specific icons for general concepts.
- Motion is brief and functional. Place nonessential animation inside `prefers-reduced-motion: no-preference`; never block a task or communicate state only through animation.

## 5. Future dark theme

The light theme is the only defined and implemented product theme. Do not add a theme control, claim dark-theme support, or invent its final palette.

Preserve future compatibility by using semantic tokens instead of raw component colors, avoiding assets or shadows that assume a white background, and ensuring states, boundaries, and icons retain meaning independently of a specific color. Treat any inherited `.dark` block as unapproved infrastructure, not as a visual contract.

## 6. Interface and accessibility patterns

- Prefer Server Components; use Client Components only for necessary interaction.
- Use existing shadcn components and their full composition. Do not create a speculative component catalog or add convenience dependencies.
- Work mobile-first: one column by default, expanding into grids or rows only as space allows. Avoid horizontal scrolling at 320 px.
- Target WCAG 2.2 AA: at least 4.5:1 contrast for normal text and 3:1 for controls and graphics.
- Every control has a visible label, an accessible name, and a target of at least 24 × 24 CSS pixels; aim for 44 px on primary mobile actions.
- Keep a clear `:focus-visible` ring with perceptible offset. Never hide it or obscure it behind fixed UI.
- Do not rely on color alone; pair state colors with text, icons, or patterns.
- Preserve logical heading order, semantic regions, keyboard navigation, and announced dynamic feedback.
- Respect `prefers-reduced-motion`; the experience must remain understandable without animation.

## 7. Agent checklist

Before delivering any UI creation or change:

- [ ] Read this guide and the related product and architecture rules.
- [ ] Keep business rules and authorization out of the UI.
- [ ] Use “Quiniela” for the brand and “quiniela” for an instance.
- [ ] Write Mexican Spanish UI copy using “tú”, neutral language, and sport-agnostic terms unless the context is genuinely sport-specific.
- [ ] Follow the content rules for titles, buttons, help, errors, and empty states.
- [ ] Give every field a visible label and make errors and dynamic status accessible.
- [ ] Preserve existing shadcn components and semantic tokens.
- [ ] Review the composition from 320 px through mobile, tablet, and desktop widths.
- [ ] Verify contrast, focus, keyboard use, icons, and states that do not depend on color alone.
- [ ] Format dates with `es-MX`; format numbers and currencies with `Intl` where applicable.
- [ ] Ensure nonessential motion respects reduced-motion preferences.
- [ ] Do not add a functional dark theme, logo, imagery, technical i18n, or unrequested dependencies.
- [ ] Run applicable checks and report only results that actually ran.
