import * as R from "remeda";
import { BROADCAST_TRANSITION_TIMING } from "../broadcast-constants";
import type {
	BroadcastAdvance,
	BroadcastGameSignal,
	BroadcastStoredState,
	LiveResults,
	ProducerState,
} from "../broadcast-types";
import * as InkColor from "./InkColor";

/**
 * How a scene set's producer moves between its scenes, which the producer functions take first. Its items are the
 * scene set's `ProducerState`, with the fields its scenes are set up with.
 */
export interface Rules<Item extends ProducerState> {
	/** What is on air (`live`) and staged (`next`) on a broadcast nothing has been written to yet. */
	initial: { live: Omit<Item, "id">; next: Omit<Item, "id"> };
	/** The scene that logically follows each scene, staged after it when nothing is queued (e.g. rosters → game). */
	sceneAfter: Record<Item["scene"], Item["scene"]>;
	/** The scene showing the game itself: goes on air as the scanner sees the game start, the scene after it as the game ends. */
	gameScene: Item["scene"];
	/** Duration a scene gets when picked, `null` runs until a Take. */
	defaultDurationMs(scene: Item["scene"]): number | null;
	/** How long the item's scene runs, when some scenes last as long as their footage instead of a given duration. */
	lengthMs?(item: Item): number | null;
	/** The item without what doesn't carry over to the item following it (e.g. a clip picked for it). */
	followedBy?(item: Item): Item;
}

/** Fields of a staged item the producer edits, see {@link editItem}. */
export type ItemPatch<Item extends ProducerState> = Partial<Omit<Item, "id">>;

/** State of a broadcast nothing has been written to yet, see `Rules.initial`. */
export function initialState<Item extends ProducerState>(
	rules: Rules<Item>,
): BroadcastStoredState<Item> {
	return {
		takeId: 0,
		takenAt: null,
		live: { ...rules.initial.live, id: 1 } as Item,
		next: { ...rules.initial.next, id: 2 } as Item,
		queue: [],
		lastItemId: 2,
		liveResults: null,
		ink: null,
	};
}

/**
 * Stored state with the producer fields added after it was written filled in with their defaults. The state is the
 * one the scene set of the rules wrote.
 */
export function withDefaults<Item extends ProducerState>(
	rules: Rules<Item>,
	state: BroadcastStoredState,
): BroadcastStoredState<Item> {
	const initial = initialState(rules);
	const stored = state as BroadcastStoredState<Item>;

	return {
		...initial,
		...stored,
		live: { ...initial.live, ...stored.live },
		next: { ...initial.next, ...stored.next },
	};
}

/**
 * Puts the staged state on air, along with the match results next showed. The first queued item gets staged, or
 * without one the scene that logically follows (e.g. rosters → game → rosters).
 */
export function take<Item extends ProducerState>(
	rules: Rules<Item>,
	state: BroadcastStoredState<Item>,
	{ liveResults, now }: { liveResults: LiveResults | null; now: number },
): BroadcastStoredState<Item> {
	const [queued, ...queue] = state.queue;
	const next = queued ?? followingItem(rules, state.next, state.lastItemId + 1);

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
 * How long the item's scene runs before the item after it can go on air by itself: the duration it was given, unless
 * the scene lasts as long as its footage (see `Rules.lengthMs`). `null` runs until a Take.
 */
export function lengthMs<Item extends ProducerState>(
	rules: Rules<Item>,
	item: Item,
) {
	return rules.lengthMs ? rules.lengthMs(item) : item.durationMs;
}

/** When the scene on air started (epoch ms): once the transition of the Take that put it on air revealed it. */
export function liveStartedAt(state: BroadcastStoredState) {
	if (state.takenAt === null) return null;

	return (
		state.takenAt + BROADCAST_TRANSITION_TIMING[state.live.transition].inMs
	);
}

/** When the scene on air has run its length (epoch ms), `null` when it runs until a Take. */
export function liveEndsAt<Item extends ProducerState>(
	rules: Rules<Item>,
	state: BroadcastStoredState<Item>,
) {
	const startedAt = liveStartedAt(state);
	const length = lengthMs(rules, state.live);
	if (startedAt === null || length === null) return null;

	return startedAt + length;
}

/**
 * When the staged item goes on air by itself (epoch ms): its transition timed to hide the scene on air as that one
 * ends. `null` when it waits for a Take.
 */
export function autoTakeAt<Item extends ProducerState>(
	rules: Rules<Item>,
	state: BroadcastStoredState<Item>,
) {
	const endsAt = liveEndsAt(rules, state);
	if (
		endsAt === null ||
		effectiveAdvance(rules, state.live, state.next) !== "timer" ||
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
 * Which game event the scanner reporting puts the item on air, given the item before it: the game scene (see
 * `Rules.gameScene`) goes on air as the game starts, the scene after it as the game ends. `null` between two scenes
 * without a game.
 */
export function gameCue<Item extends ProducerState>(
	rules: Rules<Item>,
	before: Pick<Item, "scene">,
	item: Pick<Item, "scene">,
): "start" | "end" | null {
	const { gameScene } = rules;
	if (item.scene === gameScene && before.scene !== gameScene) return "start";
	if (before.scene === gameScene && item.scene !== gameScene) return "end";

	return null;
}

/**
 * What puts the item on air besides a Take, given the item before it. An advance that can't happen there waits for a
 * Take: a timer after a scene running until a Take, a game event between scenes without a game.
 */
export function effectiveAdvance<Item extends ProducerState>(
	rules: Rules<Item>,
	before: Item,
	item: Item,
): BroadcastAdvance {
	if (item.advance === "timer" && lengthMs(rules, before) === null) {
		return "take";
	}
	if (item.advance === "game" && gameCue(rules, before, item) === null) {
		return "take";
	}

	return item.advance;
}

/**
 * What the scanner seeing a game start or end changes. A start colors the game with the ink read (Color Lock carrying
 * over from the broadcast's previous game, see `InkColor.closestPair`), the teams keeping the sides they had earlier
 * in the set (the pair's first color always goes to the same lobby team). Either puts the
 * staged item on air when it waits for that event. `null` when nothing changes.
 */
export function applyGameSignal<Item extends ProducerState>(
	rules: Rules<Item>,
	state: BroadcastStoredState<Item>,
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
): BroadcastStoredState<Item> | null {
	const inkKey =
		signal.type === "start" && signal.inks
			? InkColor.closestPair(signal.inks, state.ink?.key ?? null)
			: null;
	const colored: BroadcastStoredState<Item> =
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
		effectiveAdvance(rules, state.live, state.next) === "game" &&
		gameCue(rules, state.live, state.next) === signal.type;
	if (isWaitedFor) return take(rules, colored, { liveResults, now });

	return colored === state ? null : colored;
}

/** The staged items in the order they go on air: `next` then the queue. */
export function stagedItems<Item extends ProducerState>(
	state: BroadcastStoredState<Item>,
) {
	return [state.next, ...state.queue];
}

/**
 * Changes a staged item, `null` when it is not staged anymore (e.g. a Take put it on air). Picking another scene
 * gives the item that scene's default duration and advance.
 */
export function editItem<Item extends ProducerState>(
	rules: Rules<Item>,
	state: BroadcastStoredState<Item>,
	itemId: number,
	patch: ItemPatch<Item>,
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
							durationMs: rules.defaultDurationMs(patch.scene),
							advance: defaultAdvance(rules, before, { scene: patch.scene }),
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
export function enqueue<Item extends ProducerState>(
	rules: Rules<Item>,
	state: BroadcastStoredState<Item>,
): BroadcastStoredState<Item> {
	const staged = stagedItems(state);
	const id = state.lastItemId + 1;

	return {
		...withStaged(state, [...staged, followingItem(rules, staged.at(-1)!, id)]),
		lastItemId: id,
	};
}

/**
 * Takes an item out of the staged ones, the first queued one getting staged when it was `next`. `null` when it is not
 * staged anymore or is the only one, there always being something staged.
 */
export function removeItem<Item extends ProducerState>(
	state: BroadcastStoredState<Item>,
	itemId: number,
) {
	const staged = stagedItems(state);
	const remaining = staged.filter((item) => item.id !== itemId);
	if (remaining.length === staged.length || remaining.length === 0) {
		return null;
	}

	return withStaged(state, remaining);
}

/** Moves a staged item one place earlier or later, `null` when it is not staged anymore or can't move that way. */
export function moveItem<Item extends ProducerState>(
	state: BroadcastStoredState<Item>,
	itemId: number,
	direction: "earlier" | "later",
) {
	const staged = stagedItems(state);
	const from = staged.findIndex((item) => item.id === itemId);
	const to = direction === "earlier" ? from - 1 : from + 1;
	if (from === -1 || to < 0 || to >= staged.length) return null;

	return withStaged(state, R.swapIndices(staged, from, to));
}

function withStaged<Item extends ProducerState>(
	state: BroadcastStoredState<Item>,
	[next, ...queue]: Item[],
): BroadcastStoredState<Item> {
	return { ...state, next, queue };
}

function followingItem<Item extends ProducerState>(
	rules: Rules<Item>,
	item: Item,
	id: number,
): Item {
	const scene: Item["scene"] = rules.sceneAfter[item.scene as Item["scene"]];

	return {
		...(rules.followedBy ? rules.followedBy(item) : item),
		id,
		scene,
		durationMs: rules.defaultDurationMs(scene),
		advance: defaultAdvance(rules, item, { scene }),
	};
}

function defaultAdvance<Item extends ProducerState>(
	rules: Rules<Item>,
	before: Pick<Item, "scene">,
	item: Pick<Item, "scene">,
): BroadcastAdvance {
	return gameCue(rules, before, item) ? "game" : "timer";
}
