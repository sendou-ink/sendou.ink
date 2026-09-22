# Custom Theme System

The custom theme system lets Patreon supporters customize the sites colors, border radii, sizes, and border widths. Custom themes are created using a small set of inputs (slider values) which are expanded into a full set of CSS properties by `ThemePalette.build()`. The original intention of the system is that no combination of inputs can produce inaccessible colors.

## Files

| File | Purpose |
| ------ | --------- |
| `app/styles/vars.css` | Default CSS custom property values and semantic tokens |
| `app/features/theme/core/ThemePalette.ts` | Expands the inputs into theme variables, `DEFAULT_THEME_INPUT`, lightness values, chroma multipliers |
| `app/utils/oklch-gamut.ts` | Color math: sRGB gamut limits and WCAG contrast |
| `app/utils/schema.ts` | `themeInputSchema` and `THEME_INPUT_LIMITS` for validation |
| `app/features/theme/theme-constants.ts` | `CUSTOM_THEME_VARS` list |
| `app/components/CustomThemeSelector.tsx` | UI component |
| `app/root.tsx` | `useCustomThemeVars()` applies theme to `<html>` element |

## How colors are generated

Every color slot has a designed lightness (e.g. dark mode `--color-accent-high` is 83%). `build()` then:

1. **Lifts light slots toward the hue's cusp.** Hues like yellow are only vivid when very light, at 83% they'd be a muddy khaki. Slots with `maxCuspLift` are raised toward the lightness where the hue is at its most saturated.
2. **Rotates dark yellow shades toward amber.** Dark yellow reads as olive, so yellow hues get their hue shifted (`SHADE_HUE_SHIFT`) the further below their cusp they are.
3. **Boosts chroma for hues with a larger gamut.** The accent chroma is scaled by how much more chroma the hue can have than the default accent hue at that lightness (`GAMUT_BOOST`), so a yellow can be as vivid as the default blue.
4. **Solves for contrast.** Text colors are moved lighter/darker until they have at least 4.5:1 (WCAG AA) against every surface they are shown on.
5. **Picks the light mode accent fill.** `--color-fill-accent` (buttons, badges) is normally the same as the text color with white text on it. When a bright fill would be much more colorful (yellow, cyan...) it becomes a bright fill with dark text instead (`--_acc-fill-dark-text`).

The dark mode background lightness (`--_base-l`) is a slider of its own. Dark mode surfaces (`--color-base-5...7`) keep their distance from it.

`ThemePalette.test.ts` sweeps inputs, checks the contrast of every text/background pair (`textContrastPairs()`) and that every resolved color (`resolveColors()`) is inside the sRGB gamut. Keep both in sync with how `vars.css` uses the variables.

## Changing Default Theme Values

`ThemePalette.build(DEFAULT_THEME_INPUT)` must produce the values in the first block of `vars.css`. A unit test verifies this.

### Update procedure

1. Edit `DEFAULT_THEME_INPUT` or the constants in `ThemePalette.ts`
2. Run `ThemePalette.build(DEFAULT_THEME_INPUT)` to get the output CSS variable values
3. Update `vars.css` with the output values
4. If lightness values or offsets changed, check the `oklch()` / `calc()` calls in `vars.css` still match

## Gotchas

### Adding theme variables

Stored themes are the output of `build()` at the time they were saved, and every stored theme is expected to have every variable in `CUSTOM_THEME_VARS`. When adding a variable, add a migration that backfills it into `User.customTheme` and `AllTeam.customTheme` (see `migrations/20260922181213-custom-theme-palette-vars.ts`). Backfill the value that reproduces how existing themes render, so they only change when re-saved.

`toThemeInput()` recovers the slider values from a stored theme. The accent chroma is stored as is (`--_acc-chroma`) because the gamut boost makes it impossible to reverse from the output.

### Size and border vars are for users only

`useCustomThemeVars()` in `root.tsx` only applies `--_size-*` and `--_border-width` from the users own theme. When viewing the page of another user or team, their theme only overrides color and radius variables, never size or border, to prevent layout shifts and accessibility issues.

### The `--_base-c-0` slot is always near zero

At lightness 1.0 (pure white), no hue can have meaningful chroma in sRGB. This slot effectively rounds to 0 for all inputs.
