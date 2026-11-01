import * as R from "remeda";
import {
	BROADCAST_PROTOTYPE_CLIPS,
	BROADCAST_SCENE_DURATIONS_MS,
	BROADCAST_TRANSITION_TIMING,
} from "../broadcast-constants";
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

const DEFAULT_PRODUCER_STATE: Omit<ProducerState, "id"> = {
	scene: "rosters",
	swapSides: false,
	transition: "stinger",
	bracketIdx: null,
	bracketFocus: "remaining",
	clipId: null,
	durationMs: null,
	isAuto: true,
};

/** Fields of a staged item the producer edits, see {@link editItem}. */
export type ItemPatch = Partial<Omit<ProducerState, "id">>;

/** State of a broadcast nothing has been written to yet: rosters on air, game staged, both with a stinger. */
export function initialState(): BroadcastStoredState {
	return {
		takeId: 0,
		takenAt: null,
		live: { ...DEFAULT_PRODUCER_STATE, id: 1 },
		next: { ...DEFAULT_PRODUCER_STATE, id: 2, scene: "game" },
		queue: [],
		lastItemId: 2,
		liveResults: null,
		ink: null,
	};
}

/** Stored state with the producer fields added after it was written filled in with their defaults. */
export function withDefaults(
	state: BroadcastStoredState,
): BroadcastStoredState {
	const initial = initialState();

	return {
		...initial,
		...state,
		live: { ...initial.live, ...DEFAULT_PRODUCER_STATE, ...state.live },
		next: { ...initial.next, ...DEFAULT_PRODUCER_STATE, ...state.next },
	};
}

/**
 * Puts the staged state on air, along with the match results next showed. The first queued item gets staged, or
 * without one the scene that logically follows (e.g. rosters → game → rosters).
 */
export function take(
	state: BroadcastStoredState,
	{ liveResults, now }: { liveResults: LiveResults | null; now: number },
): BroadcastStoredState {
	const [queued, ...queue] = state.queue;
	const next = queued ?? followingItem(state.next, state.lastItemId + 1);

	return {
		takeId: state.takeId + 1,
		takenAt: now,
		live: state.next,
		next,
		queue,
		lastItemId: Math.max(state.lastItemId, next.id),
		liveResults,
		ink: state.ink,
	};
}

/**
 * How long the item's scene runs before the item after it can go on air by itself: the clip's length on the replays
 * scene, otherwise the duration it was given. `null` runs until a Take.
 */
export function lengthMs(item: ProducerState) {
	if (item.scene === "replays") {
		return (
			BROADCAST_PROTOTYPE_CLIPS.find((clip) => clip.id === item.clipId)
				?.durationMs ?? null
		);
	}

	return item.durationMs;
}

/** When the scene on air started (epoch ms): once the transition of the Take that put it on air revealed it. */
export function liveStartedAt(state: BroadcastStoredState) {
	if (state.takenAt === null) return null;

	return (
		state.takenAt + BROADCAST_TRANSITION_TIMING[state.live.transition].inMs
	);
}

/** When the scene on air has run its length (epoch ms), `null` when it runs until a Take. */
export function liveEndsAt(state: BroadcastStoredState) {
	const startedAt = liveStartedAt(state);
	const length = lengthMs(state.live);
	if (startedAt === null || length === null) return null;

	return startedAt + length;
}

/**
 * When the staged item goes on air by itself (epoch ms): its transition timed to hide the scene on air as that one
 * ends. `null` when it waits for a Take.
 */
export function autoTakeAt(state: BroadcastStoredState) {
	const endsAt = liveEndsAt(state);
	if (endsAt === null || !state.next.isAuto || state.takenAt === null) {
		return null;
	}

	return Math.max(
		state.takenAt,
		endsAt - BROADCAST_TRANSITION_TIMING[state.next.transition].outMs,
	);
}

/** The staged items in the order they go on air: `next` then the queue. */
export function stagedItems(state: BroadcastStoredState) {
	return [state.next, ...state.queue];
}

/**
 * Changes a staged item, `null` when it is not staged anymore (e.g. a Take put it on air). Picking another scene
 * gives the item that scene's default duration.
 */
export function editItem(
	state: BroadcastStoredState,
	itemId: number,
	patch: ItemPatch,
) {
	const staged = stagedItems(state);
	if (!staged.some((item) => item.id === itemId)) return null;

	return withStaged(
		state,
		staged.map((item) => {
			if (item.id !== itemId) return item;

			const isSceneChanged =
				patch.scene !== undefined && patch.scene !== item.scene;

			return {
				...item,
				...(isSceneChanged && patch.scene
					? { durationMs: defaultDurationMs(patch.scene) }
					: {}),
				...patch,
			};
		}),
	);
}

/**
 * Queues the scene that logically follows the last staged item, with that item's settings. The new item's id is
 * `lastItemId + 1` of the state given.
 */
export function enqueue(state: BroadcastStoredState): BroadcastStoredState {
	const staged = stagedItems(state);
	const id = state.lastItemId + 1;

	return {
		...withStaged(state, [...staged, followingItem(staged.at(-1)!, id)]),
		lastItemId: id,
	};
}

/**
 * Takes an item out of the staged ones, the first queued one getting staged when it was `next`. `null` when it is not
 * staged anymore or is the only one, there always being something staged.
 */
export function removeItem(state: BroadcastStoredState, itemId: number) {
	const staged = stagedItems(state);
	const remaining = staged.filter((item) => item.id !== itemId);
	if (remaining.length === staged.length || remaining.length === 0) {
		return null;
	}

	return withStaged(state, remaining);
}

/** Moves a staged item one place earlier or later, `null` when it is not staged anymore or can't move that way. */
export function moveItem(
	state: BroadcastStoredState,
	itemId: number,
	direction: "earlier" | "later",
) {
	const staged = stagedItems(state);
	const from = staged.findIndex((item) => item.id === itemId);
	const to = direction === "earlier" ? from - 1 : from + 1;
	if (from === -1 || to < 0 || to >= staged.length) return null;

	return withStaged(state, R.swapIndices(staged, from, to));
}

function withStaged(
	state: BroadcastStoredState,
	[next, ...queue]: ProducerState[],
): BroadcastStoredState {
	return { ...state, next, queue };
}

function followingItem(item: ProducerState, id: number): ProducerState {
	const scene = SCENE_AFTER[item.scene];

	return {
		...item,
		id,
		scene,
		clipId: null,
		durationMs: defaultDurationMs(scene),
		isAuto: true,
	};
}

function defaultDurationMs(scene: BroadcastScene) {
	return BROADCAST_SCENE_DURATIONS_MS[scene]?.defaultMs ?? null;
}
