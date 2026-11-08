import * as R from "remeda";
import {
	BROADCAST_PROTOTYPE_CLIPS,
	BROADCAST_SCENE_DURATIONS_MS,
	BROADCAST_TRANSITION_TIMING,
} from "../broadcast-constants";
import type {
	BroadcastAdvance,
	BroadcastGameSignal,
	BroadcastScene,
	BroadcastStoredState,
	LiveResults,
	ProducerState,
} from "../broadcast-types";
import * as InkColor from "./InkColor";

const SCENE_AFTER: Record<BroadcastScene, BroadcastScene> = {
	starting: "casters",
	casters: "rosters",
	rosters: "game",
	maps: "game",
	game: "results",
	results: "maps",
	break: "game",
	replays: "game",
	bracket: "rosters",
	team: "rosters",
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
	teamPick: "left",
	durationMs: null,
	advance: "timer",
};

/** Fields of a staged item the producer edits, see {@link editItem}. */
export type ItemPatch = Partial<Omit<ProducerState, "id">>;

/** State of a broadcast nothing has been written to yet: rosters on air, game staged for when it starts, both with a stinger. */
export function initialState(): BroadcastStoredState {
	return {
		takeId: 0,
		takenAt: null,
		live: { ...DEFAULT_PRODUCER_STATE, id: 1 },
		next: { ...DEFAULT_PRODUCER_STATE, id: 2, scene: "game", advance: "game" },
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
		live: { ...initial.live, ...state.live },
		next: { ...initial.next, ...state.next },
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
	if (
		endsAt === null ||
		effectiveAdvance(state.live, state.next) !== "timer" ||
		state.takenAt === null
	) {
		return null;
	}

	return Math.max(
		state.takenAt,
		endsAt - BROADCAST_TRANSITION_TIMING[state.next.transition].outMs,
	);
}

/**
 * Which game event the scanner reporting puts the item on air, given the item before it: a game scene goes on air as
 * the game starts, the scene after it as the game ends. `null` between two scenes without a game.
 */
export function gameCue(
	before: Pick<ProducerState, "scene">,
	item: Pick<ProducerState, "scene">,
): "start" | "end" | null {
	if (item.scene === "game" && before.scene !== "game") return "start";
	if (before.scene === "game" && item.scene !== "game") return "end";

	return null;
}

/**
 * What puts the item on air besides a Take, given the item before it. An advance that can't happen there waits for a
 * Take: a timer after a scene running until a Take, a game event between scenes without a game.
 */
export function effectiveAdvance(
	before: ProducerState,
	item: ProducerState,
): BroadcastAdvance {
	if (item.advance === "timer" && lengthMs(before) === null) return "take";
	if (item.advance === "game" && gameCue(before, item) === null) return "take";

	return item.advance;
}

/**
 * What the scanner seeing a game start or end changes. A start colors the game with the ink read (Color Lock carrying
 * over from the broadcast's previous game, see `InkColor.closestPair`), the teams keeping the sides they had earlier
 * in the set (the pair's first color always goes to the same lobby team). Either puts the
 * staged item on air when it waits for that event. `null` when nothing changes.
 */
export function applyGameSignal(
	state: BroadcastStoredState,
	{
		signal,
		liveResults,
		now,
	}: {
		signal: BroadcastGameSignal;
		/** The featured match and how many of its results are reported, `null` without one. */
		liveResults: LiveResults | null;
		now: number;
	},
): BroadcastStoredState | null {
	const inkKey =
		signal.type === "start" && signal.inks
			? InkColor.closestPair(signal.inks, state.ink?.key ?? null)
			: null;
	const colored: BroadcastStoredState =
		inkKey && liveResults
			? {
					...state,
					ink: {
						key: inkKey,
						isFlipped:
							state.ink?.matchId === liveResults.matchId
								? state.ink.isFlipped
								: false,
						matchId: liveResults.matchId,
						resultCount: liveResults.count,
					},
				}
			: state;

	const isWaitedFor =
		effectiveAdvance(state.live, state.next) === "game" &&
		gameCue(state.live, state.next) === signal.type;
	if (isWaitedFor) return take(colored, { liveResults, now });

	return colored === state ? null : colored;
}

/** The staged items in the order they go on air: `next` then the queue. */
export function stagedItems(state: BroadcastStoredState) {
	return [state.next, ...state.queue];
}

/**
 * Changes a staged item, `null` when it is not staged anymore (e.g. a Take put it on air). Picking another scene
 * gives the item that scene's default duration and advance.
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
		staged.map((item, idx) => {
			if (item.id !== itemId) return item;

			const isSceneChanged =
				patch.scene !== undefined && patch.scene !== item.scene;
			const before = idx === 0 ? state.live : staged[idx - 1]!;

			return {
				...item,
				...(isSceneChanged && patch.scene
					? {
							durationMs: defaultDurationMs(patch.scene),
							advance: defaultAdvance(before, { scene: patch.scene }),
						}
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
		advance: defaultAdvance(item, { scene }),
	};
}

function defaultAdvance(
	before: Pick<ProducerState, "scene">,
	item: Pick<ProducerState, "scene">,
): BroadcastAdvance {
	return gameCue(before, item) ? "game" : "timer";
}

function defaultDurationMs(scene: BroadcastScene) {
	return BROADCAST_SCENE_DURATIONS_MS[scene]?.defaultMs ?? null;
}
