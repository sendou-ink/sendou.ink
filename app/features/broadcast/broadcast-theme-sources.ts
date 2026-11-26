import broadcastOverlayLayout from "./components/BroadcastOverlay.layout.module.css?raw";
import broadcastOverlay from "./components/BroadcastOverlay.module.css?raw";
import teamLogoLayout from "./components/TeamLogo.layout.module.css?raw";
import teamLogo from "./components/TeamLogo.module.css?raw";
import * as ThemeCss from "./core/ThemeCss";
import * as ThemeSettings from "./core/ThemeSettings";

/**
 * A stylesheet's look (`X.module.css`: its sizes and spots, colors and type) or its layout and motion
 * (`X.layout.module.css`).
 */
type BroadcastThemeSource<Stylesheet extends string = string> =
	| Stylesheet
	| `${Stylesheet}.layout`;

/** Source of each stylesheet's look and layout modules. */
type StylesheetSources<Stylesheet extends string> = Record<
	Stylesheet,
	{ look: string; layout: string }
>;

/** Sources of the stylesheets every scene set's overlay is drawn with, part of each scene set's {@link themeDefaults}. */
export const BROADCAST_THEME_SOURCES = {
	BroadcastOverlay: { look: broadcastOverlay, layout: broadcastOverlayLayout },
	TeamLogo: { look: teamLogo, layout: teamLogoLayout },
} satisfies StylesheetSources<string>;

/** The `--bc-*` variables the designer's form sets for every scene, by group in its order. */
const SHARED_SETTING_NAMES = {
	colors: [
		"--bc-bg",
		"--bc-surface",
		"--bc-surface-high",
		"--bc-border",
		"--bc-text",
		"--bc-text-muted",
		"--bc-accent",
		"--bc-accent-text",
		"--bc-alert",
		"--bc-team-a",
		"--bc-team-a-text",
		"--bc-team-b",
		"--bc-team-b-text",
		"--bc-backdrop-image",
	],
	type: [
		"--bc-font-body",
		"--bc-font-display",
		"--bc-weight-semibold",
		"--bc-weight-bold",
		"--bc-weight-heavy",
	],
	shapes: ["--bc-radius", "--bc-radius-small", "--bc-border-width"],
	motion: [
		"--bc-enter-duration",
		"--bc-enter-distance",
		"--bc-stagger",
		"--bc-transition-duration",
		"--bc-stinger-duration",
		"--bc-caster-details-interval",
	],
} as const;

/** A shared setting's variable name, `--bc-` left out. */
type BroadcastSharedSettingKey =
	(typeof SHARED_SETTING_NAMES)[keyof typeof SHARED_SETTING_NAMES][number] extends `--bc-${infer Key}`
		? Key
		: never;

const OVERLAY_SETTINGS = ThemeSettings.settingsOf({
	source: broadcastOverlay,
	selector: ".canvas",
});

/**
 * The settings of every scene set's overlay, the theme's colors, type, shapes and motion, by group. Their defaults
 * are read off `BroadcastOverlay.module.css`.
 */
export const BROADCAST_SHARED_SETTINGS = Object.entries(
	SHARED_SETTING_NAMES,
).map(([group, names]) => ({
	group: group as keyof typeof SHARED_SETTING_NAMES,
	settings: names.map((name) => {
		const setting = OVERLAY_SETTINGS.find(
			(candidate) => candidate.name === name,
		);
		if (!setting) throw new Error(`No ${name} in BroadcastOverlay.module.css`);

		return {
			...setting,
			// labeled by translations instead of the comments, which head groups there
			hint: null,
			key: name.slice("--bc-".length) as BroadcastSharedSettingKey,
		};
	}),
}));

/** A scene set's overlays' default styles as theme CSS by source, what the designer shows to copy from. */
export function themeDefaults<Stylesheet extends string>(
	sources: StylesheetSources<Stylesheet>,
) {
	return Object.fromEntries(
		Object.entries<{ look: string; layout: string }>(sources).flatMap(
			([stylesheet, { look, layout }]) => [
				[stylesheet, ThemeCss.fromModuleSource({ source: look, stylesheet })],
				[
					`${stylesheet}.layout`,
					ThemeCss.fromModuleSource({ source: layout, stylesheet }),
				],
			],
		),
	) as Record<BroadcastThemeSource<Stylesheet>, string>;
}
