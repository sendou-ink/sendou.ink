import type {
	BroadcastScene,
	BroadcastStoredState,
	LiveResults,
	ProducerState,
} from "../broadcast-types";

const SCENE_AFTER: Record<BroadcastScene, BroadcastScene> = {
	starting: "casters",
	casters: "rosters",
	rosters: "game",
	maps: "game",
	game: "rosters",
	break: "game",
	replays: "game",
	bracket: "rosters",
	technical: "game",
	ending: "starting",
};

/** State of a broadcast nothing has been written to yet: rosters on air, game staged. */
export function initialState(): BroadcastStoredState {
	return {
		takeId: 0,
		live: { scene: "rosters", swapSides: false },
		next: { scene: "game", swapSides: false },
		liveResults: null,
	};
}

/**
 * Puts the staged state on air, along with the match results next showed, and stages the scene that logically
 * follows it (e.g. rosters → game → rosters).
 */
export function take(
	state: BroadcastStoredState,
	liveResults: LiveResults | null,
): BroadcastStoredState {
	return {
		takeId: state.takeId + 1,
		live: state.next,
		next: followingState(state.next),
		liveResults,
	};
}

function followingState(taken: ProducerState): ProducerState {
	return { ...taken, scene: SCENE_AFTER[taken.scene] };
}
