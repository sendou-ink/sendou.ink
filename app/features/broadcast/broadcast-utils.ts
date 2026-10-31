import type { BROADCAST_SCENE_PARTS } from "./broadcast-constants";
import type { BroadcastMatch } from "./broadcast-types";

/** Builds the scene's `data-part` attributes, only allowing the parts documented in {@link BROADCAST_SCENE_PARTS}. */
export const scenePart =
	<S extends keyof typeof BROADCAST_SCENE_PARTS>(_scene: S) =>
	(name: (typeof BROADCAST_SCENE_PARTS)[S][number]) => ({
		"data-part": name,
	});

/** The featured match's teams from left to right. */
export const teamsBySide = (
	match: Pick<BroadcastMatch, "teams">,
	swapSides: boolean,
) => (swapSides ? ([match.teams[1], match.teams[0]] as const) : match.teams);
