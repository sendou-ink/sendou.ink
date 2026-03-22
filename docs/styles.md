# Custom Theme System

The custom theme system lets Patreon supporters customize the sites colors, border radii, sizes, and border widths. Custom themes are created using as a small set of inputs which are expanded into a full set of CSS properties via gamut clamping.

## Files

| File | Purpose |
| ------ | --------- |
| `app/styles/vars.css` | Default CSS custom property values and semantic tokens |
| `app/utils/oklch-gamut.ts` | Gamut clamping math, lightness values, chroma multipliers |
| `app/utils/zod.ts` | `themeInputSchema` and `THEME_INPUT_LIMITS` for validation |
| `app/db/tables.ts` | `CustomTheme` type and `CUSTOM_THEME_VARS` list |
| `app/components/CustomThemeSelector.tsx` | UI component, `DEFAULT_THEME_INPUT` |
| `app/root.tsx` | `useCustomThemeVars()` applies theme to `<html>` element |

## Changing Default Theme Values

The default theme is defined in **three places that must stay in sync**:

### 1. `vars.css` — CSS defaults

The `html { }` block at the beginning of `vars.css` contains the default values that apply when no custom theme is active. These are the output of `clampThemeToGamut(DEFAULT_THEME_INPUT)`.

### 2. `oklch-gamut.ts` — Lightness and multiplier constants

`BASE_LIGHTNESS_VALUES`, `ACCENT_LIGHTNESS_VALUES`, `BASE_CHROMA_MULTIPLIERS`, and `ACCENT_CHROMA_MULTIPLIERS` define how the input chroma/hue maps to each color step. The lightness values must match the percentages used in the `oklch()` calls in `vars.css`.

### 3. `CustomThemeSelector.tsx` — `DEFAULT_THEME_INPUT`

The `DEFAULT_THEME_INPUT` object defines the default slider positions (hue, chroma, radius, etc.). Running `clampThemeToGamut(DEFAULT_THEME_INPUT)` should produce values matching the CSS defaults in `vars.css`.

### Update procedure

When changing the default theme:

1. Edit `DEFAULT_THEME_INPUT` in `CustomThemeSelector.tsx` with the new input values
2. Run `clampThemeToGamut(DEFAULT_THEME_INPUT)` to get the output CSS variable values
3. Update `vars.css` with the output values in the `html { }` block
4. Verify lightness values in `vars.css` `oklch()` calls still match `BASE_LIGHTNESS_VALUES` and `ACCENT_LIGHTNESS_VALUES` in `oklch-gamut.ts`

When changing lightness values or chroma multipliers:

1. Edit the constants in `oklch-gamut.ts`
2. Update the matching `oklch()` percentages in `vars.css` (e.g. if you change `BASE_LIGHTNESS_VALUES[1]` from `0.94873` you must also update `oklch(94.873% ...)` in `vars.css`)
3. Recompute and update the default chroma values in `vars.css` by running `clampThemeToGamut(DEFAULT_THEME_INPUT)` with the new multipliers

## Gotchas

### Gamut clamping makes reverse engineering unreliable

You cannot always recover the original `baseChroma` from a stored `CustomTheme`. At high lightness values, sRGB cannot display much chroma, so the clamping function reduces it. Dividing a clamped output by its multiplier gives a number **smaller** than the true input. Indices 2–7 are more reliable but recovery success depends on the specific hue. ``themeInputFromCustomTheme()`` uses the second indice for input recovery.

### Size and border vars are for users only

`useCustomThemeVars()` in `root.tsx` only applies `--_size-*` and `--_border-width` from the users own theme. When viewing the page of another user or team, their theme only overrides color and radius variables, never size or border, to prevent layout shifts and accessibility issues.

### The `--_base-c-0` slot is always near zero

At lightness 1.0 (pure white), no hue can have meaningful chroma in sRGB. This slot effectively rounds to 0 for all inputs.
