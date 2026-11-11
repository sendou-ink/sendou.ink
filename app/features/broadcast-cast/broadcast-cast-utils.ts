import type { ObjectiveTimelineEvent } from "~/components/ObjectiveTimeline";
import type { Pronouns } from "~/db/tables-json";
import type { BROADCAST_SCENE_PARTS } from "./broadcast-cast-constants";
import type { CastProducerState, CastScene } from "./broadcast-cast-types";

/** Builds the scene's `data-part` attributes, only allowing the parts documented in {@link BROADCAST_SCENE_PARTS}. */
export const scenePart =
	<S extends keyof typeof BROADCAST_SCENE_PARTS>(_scene: S) =>
	(name: (typeof BROADCAST_SCENE_PARTS)[S][number]) => ({
		"data-part": name,
	});

/** Pronouns as shown next to a name, e.g. "he/him". */
export function pronounsLabel(pronouns: Pronouns) {
	return `${pronouns.subject}/${pronouns.object}`;
}

/**
 * Share of the game (0-1) each team held the objective, in the reads' team order. A read's control lasts until the
 * next read, the time neither held it is left out of both.
 */
export function controlShares(
	events: readonly ObjectiveTimelineEvent[],
): [number, number] {
	const sorted = events.toSorted((a, b) => a.t - b.t);
	const duration = (sorted.at(-1)?.t ?? 0) - (sorted[0]?.t ?? 0);
	const held: [number, number] = [0, 0];
	if (duration <= 0) return held;

	for (let i = 0; i < sorted.length - 1; i++) {
		const control = sorted[i]!.data.control;
		if (control === null) continue;

		held[control] += sorted[i + 1]!.t - sorted[i]!.t;
	}

	return [held[0] / duration, held[1] / duration];
}

/**
 * Whether the scene shows the featured match's teams (rosters, maps and results), having nothing to show without a
 * match cast on the channel. The team scene does only when it follows one of the match's sides (`teamPick`), any other team it shows on its own.
 */
export function needsFeaturedMatch(
	scene: CastScene,
	teamPick?: CastProducerState["teamPick"],
) {
	if (scene === "team") {
		return teamPick === "left" || teamPick === "right";
	}

	return scene === "rosters" || scene === "maps" || scene === "results";
}
