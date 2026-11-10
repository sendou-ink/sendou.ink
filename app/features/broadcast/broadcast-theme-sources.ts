import broadcastOverlayLayout from "./components/BroadcastOverlay.layout.module.css?raw";
import broadcastOverlay from "./components/BroadcastOverlay.module.css?raw";
import teamLogoLayout from "./components/TeamLogo.layout.module.css?raw";
import teamLogo from "./components/TeamLogo.module.css?raw";
import * as ThemeCss from "./core/ThemeCss";

/**
 * A stylesheet's look (`X.module.css`: its sizes and spots, colors and type) or its layout and motion
 * (`X.layout.module.css`).
 */
export type BroadcastThemeSource<Stylesheet extends string = string> =
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

/** A scene set's overlays' default styles as theme CSS by source, the base the designer's edits are diffed against. */
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
