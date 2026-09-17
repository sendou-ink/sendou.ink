# Styling

## Hover

- Every interactive element has hover feedback. Non-interactive elements have none.
- Hover feedback is a background change one step up the bg scale from the surface the element sits on: on `--color-bg`/`--color-bg-nav` use `--color-bg-high`, on `--color-bg-high` use `--color-bg-higher`.
- Transparent elements (nav links, icon buttons, list rows, menu items, outlined and minimal buttons) get that background on hover, clipped by their own `border-radius`.
- Filled elements (accent, success, error buttons and badges) keep their fill and mix 15% of `--color-text` into it: `color-mix(in oklch, var(--color-text-accent) 85%, var(--color-text))`. This moves the same direction as the bg scale in both themes.
- Muted text (`--color-text-high`) lifts to `--color-text` on hover. Text already at `--color-text` does not change color.
- Plain inline text links underline on hover; nothing else changes. Hover feedback is one or the other, never a background *and* an underline: the underline comes from a global `a:hover` rule, so every link class with a hover background declares `text-decoration: none`.
- Transition `background-color 0.15s` (add `color 0.15s` when the text lifts). No `all`, no other durations.
- `:focus-visible` gets the same background as hover plus `outline: var(--focus-ring)`.
- The selected/current state (`aria-current="page"`, `aria-selected`) is `--color-bg-higher` and bold, so it stays distinct from hover.
- Disabled and pending elements have no hover styles (`:hover:not(:disabled)`); their cursor is `not-allowed`.
- No `transform`, `scale`, `opacity`, `filter` or `box-shadow` on hover. `:active` may use `translateY(1px)`.
- Elements whose own fill is already `--color-bg-higher` (chips, pills, bg-higher cards) have no next step on the scale, so they use the same 15% text mix: `color-mix(in oklch, var(--color-bg-higher) 85%, var(--color-text))`.
- Tabs are the exception to the background step: hovering an unselected tab colours its indicator border `--color-border-high` and lifts the text, the selected tab keeps the accent indicator.
- Shared components (`SendouButton`, menus, tabs, selects) own their hover styles in their own module; feature CSS never adds or overrides hover on them.
- `SendouButton` derives its hover from its fill. A feature class that changes a button's fill sets `--button-bg` instead of `background`, so the hover follows (`--button-bg: var(--color-bg-higher)`); the transparent variants (`minimal`, `outlined`) already hover to `--color-bg-high` (`minimal` carries `--s-1` of horizontal padding so the background has room around the text), override with `--button-hover-bg` only when the button sits on a `--color-bg-high` surface. A `background` declaration in feature CSS wins over the shared hover through the cascade layers and leaves the button with no hover at all.
