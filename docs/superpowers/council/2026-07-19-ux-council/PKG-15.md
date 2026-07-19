# PKG-15 [P0/S] Owner feedback: body font must be Fredoka everywhere — kill the Inter/system-default fallthrough

Owner report (2026-07-19, verbatim intent): "the body font needs to be one of the ones I use in other apps, not this AI default."

## Diagnosis (verified)
- Fredoka IS installed and loaded: `@fontsource/fredoka` 400/500/600/700 imported in src/main.tsx:4-7; Luckiest Guy likewise.
- But `:root` (src/styles.css:17-19) sets `font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` — NOT `var(--viota-ui-font)`. Inter is never shipped, so every element that doesn't explicitly set `font-family: var(--viota-ui-font)` renders in the system default. Only components that opted in look right → the patchwork the owner is seeing.
- "Inter" also appears as a ghost inside `--viota-display-font` and `--viota-ui-font` stacks (styles.css:2-3).

## Changes
1. `:root` font-family → `var(--viota-ui-font)`.
2. Remove `Inter` from both font variables; fallback stacks become `"Fredoka", ui-sans-serif, system-ui, sans-serif` (ui) and `"Luckiest Guy", "Fredoka", ui-sans-serif, system-ui, sans-serif` (display).
3. Audit EVERY `font-family` declaration in src/styles.css (~25 of them): UI text uses `var(--viota-ui-font)`, display/headline uses `var(--viota-display-font)`. Georgia/serif stays ONLY on genuine Wikipedia article-content surfaces (the in-race article rendering; note PKG-08 already reskins the preview blurb away from serif — do not undo PKG-08's work, it ran earlier this cycle). Explicit `font-family: var(--viota-ui-font)` declarations that merely repeat the new root default may be removed where safe (inputs/buttons need their own declaration — form controls don't inherit by default; keep those).
4. Buttons/inputs/selects/textareas: ensure a rule sets `font: inherit` or `font-family: var(--viota-ui-font)` so form controls don't regress to UA fonts.
5. Quick visual sanity: `npm run build` + open the app (vite preview) and confirm body copy (e.g. "Two articles. Links only. Beat the clock.", board rows, hints) renders Fredoka at 390px and 1440px. A screenshot is nice-to-have, not required.

## Acceptance criteria
- `grep -n "Inter" src/styles.css` returns nothing
- `:root` uses `var(--viota-ui-font)`; form controls covered by an inherit rule
- Georgia appears only on Wikipedia article-content selectors
- Full client suite green

## Risk
Tiny. Watch for layout shifts where system-font metrics differed from Fredoka (rows/buttons may get a couple px taller) — eyeball the preview once.

## OWNER-PROXY RULING (binding)
Fredoka is the owner's ratified viota body font (his cross-app shortlist). This is a fallthrough bug fix, not a font choice — do not introduce any new font.
