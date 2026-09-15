# Modulo Design System

A flat, Bauhaus- and Swiss-modernist-derived identity built on **a modular grid of squares**. Each square holds one elementary geometric form — a full circle, a half circle, a quarter circle, a "leaf" (a square with two opposite corners fully rounded), a donut or a dot. Butting and rotating those modules produces compositions that look casual but are tightly controlled: rhythm and movement without a single figurative illustration. A handful of modules generates infinite headers, covers and backgrounds.

## Sources supplied
- `uploads/Screenshot_20260911-020004.png` — one Android onboarding screen (step 3 of 3). Archived at `assets/reference/onboarding-source-screenshot.png`.
- A written brand description (Italian) covering palette, typography and layout — reproduced in the sections below.

**Nothing else was supplied**: no codebase, no Figma file, no repository, no font binaries, no logo, no icon set, no decks, no product copy beyond the screenshot's lorem ipsum. Everything here is derived from those two sources; where a value could only be measured off a raster screenshot it is noted as approximate. If a real codebase or Figma file exists, hand it over and this system should be re-derived from it — screenshots are lossy.

### Naming
No brand or product name appears in the sources. **"Modulo"** is a working placeholder for the system (Italian for *module*), not a brand. Rename it when the real name is known.

### No logo
The sources contain no logo or brand mark, so **none was drawn**. Wherever a mark would go, set the brand name in plain Archivo bold navy (see `thumbnail.html`). Supply the real mark and drop it into `assets/`.

---

## Content fundamentals

The only real copy in the source is a title (`Irregular circle Shapes`) and placeholder lorem ipsum, so the voice below is inferred from the title's construction and the brand description, and should be confirmed.

- **Register**: descriptive and matter-of-fact. Titles name the thing on screen rather than selling it — "Irregular circle Shapes", not "Discover a world of shapes".
- **Person**: neutral and impersonal in titles (no "you", no "we", no imperatives). Reserve second person for actions — button labels are verbs: "Get started", "Continue", "Skip".
- **Casing**: sentence case everywhere, with a quirk carried from the source — the title `Irregular circle Shapes` capitalises the final noun. Treat that as a one-off artefact, not a rule: write plain sentence case (`Irregular circle shapes`) unless the client asks otherwise. Uppercase is used *only* for badges, eyebrow labels and step counters, always with 0.08em tracking.
- **Length**: titles 2–5 words, wrapping to at most two lines at 23px. Body blocks 15–35 words, 2–4 lines. Never a wall of text; the pattern is doing half the communicating.
- **Punctuation**: full stops in body copy, none in titles, labels or buttons. No exclamation marks. No ellipses as suspense.
- **Emoji: never.** Not in UI, not in copy. The geometric modules are the system's only "illustration", and emoji would fight them.
- **Numbers**: digits, including one through nine ("Step 3 of 3", "4 modules").
- **Vibe**: a print studio's spec sheet — calm, precise, confident, nothing breathless. Examples in the right register: "Modular square grid" · "Rotate and repeat" · "Modules butt together edge to edge." Wrong register: "Shapes that pop! 🎉" · "Unleash your creativity".

---

## Visual foundations

### Colour
Warm/cold contrast over a dark anchor. **Indigo `#1C2150`** is the app ground; **navy `#2F3452`** is every piece of type and every dark shape — the same colour does structure and typography, which is what holds the system together. The accents — **coral `#FF6B35`**, **yellow `#FFC600`**, **lime `#D9E05B`**, **mint `#6DD47E`** — appear *in the geometric modules and nowhere else*, with one exception: the single accent button allowed per screen, and the coral focus ring. **Grey `#ECEEEF`** is the breathing space between saturated blocks — in the pattern it is a "rest" tile; in layout it is the sunken surface. White is the card.

Rules: never accent-coloured body type; never white type on lime, mint or yellow (navy instead); no more than two accents dominating one pattern block; a module's shape colour is never its own ground colour.

### Typography
One family, a geometric grotesque, at two levels: bold navy titles (~23px, tight 1.18 leading, left aligned, slightly negative tracking) and regular grey body (11–12px, airy 1.9 leading). **Weight does the hierarchy work, not colour or size jumps.** No italics; medium (500) is for buttons and tabs only. Uppercase + 0.08em tracking for labels and badges.

**Font substitution — needs confirming.** No binaries were supplied. The screenshot's face is a neo-grotesque with a double-storey *a*, straight-legged *R* and tall x-height (Helvetica Now / Archivo family). We use **Archivo** (Google Fonts, loaded by `@import` in `tokens/fonts.css`) as the nearest match, with Archivo Expanded reserved for display. **Please send the real font files (or the licensed family name) and we'll swap them in.**

### Layout
An 8pt grid with a single 4px half-step. The white card has 24px corners and 16px lateral padding on its body. Media — always a pattern block — occupies the top half (measured at ~58% in the source), flush to three edges and clipped by the card's radius. Screen gutter 24px; the card floats ~12–18px inside the device edge on the indigo ground. Onboarding page indicator sits 24px above the card's bottom edge, centred; it is the only centred element in the system. Minimum touch target 44px.

### Backgrounds & imagery
No photography, no gradients, no textures, no noise/grain, no hand-drawn anything. **Backgrounds are either flat indigo or a full-bleed pattern grid.** The pattern always bleeds off every edge it touches — a composition that reads as framed or centred is wrong. Text never sits on top of the pattern; the two are stacked, never overlaid. If photography is ever introduced it should be cool, flat and desaturated, but there is no precedent in the source.

### Corners & borders
Pattern modules are hard squares (0px) — the shapes inside them supply all the curvature. Cards 24px, fields 12px, checkboxes 8px, buttons and badges fully pill. Borders are 1.5px and rare: navy for outline buttons and selected states, `--grey-300` for form fields, `--grey-100` for dividers. No borders on cards.

### Shadows & elevation
Flat system with exactly three shadows, all soft and indigo-tinted (never grey or black): `--shadow-card` for a white card on the indigo ground, `--shadow-raised` for a lifted control, `--shadow-press` for a switch knob. No inner shadows. No shadows on buttons, badges or modules. Cards on light grounds lose the shadow and separate by surface tint instead.

### Transparency & blur
Essentially unused. The only transparencies are white at 72% for body copy on indigo and the `--surface-scrim` overlay behind a modal. **No backdrop blur, no frosted glass, no protection gradients** — if type needs protection from a pattern, move the type, don't veil the pattern.

### Motion
Short, flat, no personality tricks. 120ms for hover/press, 200ms for toggles and indicator changes, 320ms for step transitions, all on `cubic-bezier(.2,0,.2,1)`. Onboarding steps cross-fade with a small horizontal slide. Modules never spin, bounce, stagger or animate in — the pattern is static. No parallax, no scroll-linked motion.

### States
- **Hover**: filled controls darken (`--action-primary-hover`); outline and ghost controls fill with `--grey-100`; icon buttons drop to 85% opacity. Never a colour *lightening*, never a scale-up.
- **Press**: `scale(0.97)` plus the darker press token. Nothing else.
- **Focus**: 2px coral ring at 2px offset — the only place coral appears outside a shape.
- **Disabled**: `--grey-100` fill, `--grey-300` text, no opacity tricks on the whole control.
- **Selected**: navy fill or navy 1.5px border; mint fill only on `Switch`, the one control where an accent carries state.

---

## Iconography

The source contains exactly one icon: a white × in a black circle, overlapping the card's top-left corner. No icon font, sprite sheet or SVG set was supplied, and none was invented.

- **Substitution, flagged:** UI kits and cards use **[Lucide](https://lucide.dev) 0.544.0 from CDN** (`unpkg.com/lucide@0.544.0/dist/umd/lucide.min.js`), which matches the source glyph's geometry — 2px stroke, round caps, 24px grid, no fills. **If the product has its own icon set, send it and we'll replace Lucide.**
- **Sizes**: 16px inside small controls, 18px in fields, 20–22px in icon buttons, 24px maximum. Icons are monochrome and take the surrounding text colour.
- **Icons are never coloured with an accent** and never placed on top of the pattern except the close button.
- **No emoji, ever.** No unicode dingbats as icons.
- **The geometric modules are not icons.** Use `ShapeTile` for decoration, bullets and avatar stand-ins; never as a symbol that carries meaning.

---

## Intentional additions
No source defined a component inventory, so a small standard set was authored, sized to what the one supplied screen needs plus the minimum for building more of the same app:
- `PatternGrid`, `ShapeTile`, `PageIndicator` — direct from the source and the brand description; `PatternGrid` is the identity itself.
- `Card`, `IconButton` — visible in the source screen.
- `Button`, `Badge`, `Input`, `Checkbox`, `Switch` — **additions**, not present in the source. They are needed to build anything beyond the onboarding carousel and are styled strictly from the documented palette, radii and states. Treat their details as proposals, not ground truth.

---

## Index

| Path | What it is |
| --- | --- |
| `styles.css` | Global entry point — `@import` list only. Consumers link this one file. |
| `tokens/` | `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `radii.css`, `elevation.css`, `motion.css`, `base.css` |
| `components/brand/` | `PatternGrid`, `ShapeTile`, `PageIndicator` |
| `components/core/` | `Button`, `IconButton`, `Badge` |
| `components/surfaces/` | `Card` |
| `components/forms/` | `Input`, `Checkbox`, `Switch` |
| `ui_kits/onboarding/` | Interactive recreation of the source onboarding flow (`index.html`, `README.md`) |
| `guidelines/` | Foundation specimen cards — Colors, Type, Spacing, Brand |
| `assets/reference/` | The supplied source screenshot |
| `thumbnail.html` | Homepage tile |
| `SKILL.md` | Agent-skill wrapper for use outside this project |

Each component directory holds `<Name>.jsx`, `<Name>.d.ts` (props contract) and `<Name>.prompt.md` (what & when, with a usage example), plus one card HTML rendering its states.

## Not built
No slide template, marketing site, docs site or second product surface was supplied, so none was created. No decks, no email templates, no print system.
