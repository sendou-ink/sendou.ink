import { combineStyles } from "./broadcast-utils";
import broadcastOverlayLayout from "./components/BroadcastOverlay.layout.module.css";
import broadcastOverlay from "./components/BroadcastOverlay.module.css";
import teamLogoLayout from "./components/TeamLogo.layout.module.css";
import teamLogo from "./components/TeamLogo.module.css";

/** A scene set's theme stylesheets' classes by stylesheet, each class name both modules' (look and layout) classes of it. */
export type BroadcastThemeClasses = Record<string, Record<string, string>>;

/** Classes of the stylesheets every scene set's overlay is drawn with, part of each scene set's {@link BroadcastThemeClasses}. */
export const BROADCAST_THEME_CLASSES = {
	BroadcastOverlay: combineStyles(broadcastOverlay, broadcastOverlayLayout),
	TeamLogo: combineStyles(teamLogo, teamLogoLayout),
} satisfies BroadcastThemeClasses;

/**
 * The custom CSS with the overlay stylesheets' classes, written `.{stylesheet}-{class}` (e.g. `.GameScene-infoCard`,
 * see `ThemeCss.fromModuleSource`, the same for the look and the layout module), resolved to the CSS modules'
 * generated class names.
 */
export function resolveThemeClasses(
	css: string,
	classes: BroadcastThemeClasses,
) {
	return css.replace(
		/\.([A-Z][A-Za-z]*)-(-?[_a-zA-Z][\w-]*)/g,
		(match, stylesheet: string, className: string) => {
			// either module's class of it is on the same elements, one keeps the selector's specificity
			const resolved = classes[stylesheet]?.[className]?.split(" ")[0];

			return resolved ? `.${resolved}` : match;
		},
	);
}
