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

const DEFAULT_PRODUCER_STATE: ProducerState = {
	scene: "rosters",
	swapSides: false,
	transition: "stinger",
	bracketIdx: null,
	bracketFocus: "remaining",
	clipId: null,
};

/** State of a broadcast nothing has been written to yet: rosters on air, game staged, both with a stinger. */
export function initialState(): BroadcastStoredState {
	return {
		takeId: 0,
		live: DEFAULT_PRODUCER_STATE,
		next: { ...DEFAULT_PRODUCER_STATE, scene: "game" },
		liveResults: null,
		ink: null,
	};
}

/** Stored state with the producer fields added after it was written filled in with their defaults. */
export function withDefaults(
	state: BroadcastStoredState,
): BroadcastStoredState {
	return {
		...state,
		live: { ...DEFAULT_PRODUCER_STATE, ...state.live },
		next: { ...DEFAULT_PRODUCER_STATE, ...state.next },
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
		ink: state.ink,
	};
}

function followingState(taken: ProducerState): ProducerState {
	return { ...taken, scene: SCENE_AFTER[taken.scene] };
}
