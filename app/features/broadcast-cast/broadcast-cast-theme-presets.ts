import capsule from "./presets/capsule.css?raw";
import matchday from "./presets/matchday.css?raw";
import teletext from "./presets/teletext.css?raw";
import zine from "./presets/zine.css?raw";

/**
 * Ready-made themes of the cast overlay the designer loads as a starting point, in its picker's order. Each is custom
 * CSS as a producer would write it, on the theming contract alone: the theme variables, the `data-scene` and
 * `data-part` hooks with their state attributes and the keyframes. So they also are the worked examples of it.
 */
export const BROADCAST_THEME_PRESETS = [
	{ key: "zine", css: zine.trim() },
	{ key: "matchday", css: matchday.trim() },
	{ key: "capsule", css: capsule.trim() },
	{ key: "teletext", css: teletext.trim() },
] as const;
