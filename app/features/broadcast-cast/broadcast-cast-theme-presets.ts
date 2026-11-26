import * as R from "remeda";
import type { BroadcastSettings } from "~/features/broadcast/broadcast-types";
import * as ThemeSettings from "~/features/broadcast/core/ThemeSettings";
import { BROADCAST_THEME_SETTING_NAMES } from "./broadcast-cast-theme-sources";
import capsule from "./presets/capsule.css?raw";
import matchday from "./presets/matchday.css?raw";
import teletext from "./presets/teletext.css?raw";
import zine from "./presets/zine.css?raw";

type Theme = Pick<BroadcastSettings, "css" | "variables">;

const PRESET_SOURCES = [
	{ key: "zine", source: zine },
	{ key: "matchday", source: matchday },
	{ key: "capsule", source: capsule },
	{ key: "teletext", source: teletext },
] as const;

/**
 * Ready-made themes of the cast overlay the designer loads as a starting point, in its picker's order. Each is written
 * as custom CSS a producer would write, on the theming contract alone: the theme variables, the `data-scene` and
 * `data-part` hooks with their state attributes and the keyframes. So they also are the worked examples of it. Loaded,
 * the variables its `[data-broadcast]` rule sets that are settings fill the designer's form and the rest is its CSS.
 */
export const BROADCAST_THEME_PRESETS = PRESET_SOURCES.map(
	({ key, source }) => ({
		key,
		source: source.trim(),
		...ThemeSettings.extract({
			css: source.trim(),
			names: BROADCAST_THEME_SETTING_NAMES,
		}),
	}),
);

/** The preset the theme is, unchanged since loaded in the designer. `null` for the default styles or a theme of one's own. */
export function presetKeyOf(theme: Theme) {
	const { css, variables } = withPresetSettings(theme);

	return (
		BROADCAST_THEME_PRESETS.find(
			(preset) =>
				preset.css === css && R.isDeepEqual(preset.variables, variables),
		)?.key ?? null
	);
}

/**
 * The theme with a preset saved before the designer had settings, its CSS whole, as the preset loads now: its
 * variables as settings. Any other theme as it is.
 */
export function withPresetSettings(theme: Theme): Theme {
	if (!R.isEmpty(theme.variables)) return theme;

	const preset = BROADCAST_THEME_PRESETS.find(
		(candidate) => candidate.source === theme.css,
	);

	return preset ? { css: preset.css, variables: preset.variables } : theme;
}
