import * as R from "remeda";
import { describe, expect, test } from "vitest";
import { BROADCAST_PROTOTYPE_CLIPS } from "../broadcast-constants";
import type { BroadcastStoredState, ProducerState } from "../broadcast-types";
import * as Producer from "./Producer";

const ink = {
	key: "lockYellowPurple",
	isFlipped: false,
	matchId: 1,
	resultCount: 1,
} as const;

const clip = BROADCAST_PROTOTYPE_CLIPS[0];

const TAKEN_AT = 1_000_000;

const item = (
	id: number,
	overrides: Partial<ProducerState> = {},
): ProducerState => ({
	id,
	scene: "game",
	swapSides: false,
	transition: "stinger",
	bracketIdx: null,
	bracketFocus: "remaining",
	clipId: null,
	durationMs: null,
	isAuto: true,
	...overrides,
});

const stateWith = ({
	live = item(1, { scene: "rosters" }),
	next = item(2),
	queue = [],
	takenAt = TAKEN_AT,
}: {
	live?: ProducerState;
	next?: ProducerState;
	queue?: ProducerState[];
	takenAt?: number | null;
}): BroadcastStoredState => ({
	takeId: 3,
	takenAt,
	live,
	next,
	queue,
	lastItemId: Math.max(live.id, next.id, ...queue.map((queued) => queued.id)),
	liveResults: null,
	ink,
});

const stagedIds = (state: BroadcastStoredState | null) =>
	state ? Producer.stagedItems(state).map((staged) => staged.id) : null;

describe("Producer.take", () => {
	test("puts the staged state on air and stages the following scene with the same settings, keeping the ink colors", () => {
		const taken = Producer.take(
			stateWith({
				next: item(2, {
					scene: "game",
					swapSides: true,
					bracketIdx: 1,
					bracketFocus: "losers",
				}),
			}),
			{ liveResults: { matchId: 1, count: 2 }, now: 5 },
		);

		expect(taken).toEqual({
			takeId: 4,
			takenAt: 5,
			live: item(2, {
				scene: "game",
				swapSides: true,
				bracketIdx: 1,
				bracketFocus: "losers",
			}),
			next: item(3, {
				scene: "rosters",
				swapSides: true,
				bracketIdx: 1,
				bracketFocus: "losers",
			}),
			queue: [],
			lastItemId: 3,
			liveResults: { matchId: 1, count: 2 },
			ink,
		});
	});

	test("stages the first queued item", () => {
		const taken = Producer.take(
			stateWith({
				next: item(2, { scene: "replays" }),
				queue: [item(3, { scene: "maps" }), item(4)],
			}),
			{ liveResults: null, now: 5 },
		);

		expect(taken.live.id).toBe(2);
		expect(stagedIds(taken)).toEqual([3, 4]);
		expect(taken.lastItemId).toBe(4);
	});

	test("stages the following scene without the clip played or the scene's duration", () => {
		const taken = Producer.take(
			stateWith({ next: item(2, { scene: "bracket", durationMs: 20_000 }) }),
			{ liveResults: null, now: 5 },
		);

		expect(taken.next).toMatchObject({ scene: "rosters", durationMs: null });

		const afterClip = Producer.take(
			stateWith({ next: item(2, { scene: "replays", clipId: clip.id }) }),
			{ liveResults: null, now: 5 },
		);

		expect(afterClip.next).toMatchObject({ scene: "game", clipId: null });
	});
});

describe("Producer.lengthMs", () => {
	test.each([
		{
			why: "clip",
			item: item(1, { scene: "replays", clipId: clip.id }),
			expected: clip.durationMs,
		},
		{ why: "OBS footage", item: item(1, { scene: "replays" }), expected: null },
		{
			why: "unknown clip",
			item: item(1, { scene: "replays", clipId: "gone" }),
			expected: null,
		},
		{
			why: "duration",
			item: item(1, { scene: "bracket", durationMs: 15_000 }),
			expected: 15_000,
		},
		{ why: "until a Take", item: item(1, { scene: "game" }), expected: null },
	])("$why", ({ item: timed, expected }) => {
		expect(Producer.lengthMs(timed)).toBe(expected);
	});
});

describe("Producer.autoTakeAt", () => {
	test("hides the end of the clip behind the next stinger", () => {
		const state = stateWith({
			live: item(1, { scene: "replays", clipId: clip.id, transition: "cut" }),
			next: item(2, { transition: "stinger" }),
		});

		expect(Producer.liveEndsAt(state)).toBe(TAKEN_AT + clip.durationMs);
		expect(Producer.autoTakeAt(state)).toBe(TAKEN_AT + clip.durationMs - 704);
	});

	test("counts the scene's length from the stinger revealing it", () => {
		const state = stateWith({
			live: item(1, {
				scene: "bracket",
				durationMs: 15_000,
				transition: "stinger",
			}),
			next: item(2, { transition: "cut" }),
		});

		expect(Producer.autoTakeAt(state)).toBe(TAKEN_AT + 704 + 15_000);
	});

	test.each([
		{
			why: "the live scene runs until a Take",
			state: stateWith({ live: item(1, { scene: "game" }) }),
		},
		{
			why: "next waits for a Take",
			state: stateWith({
				live: item(1, { scene: "bracket", durationMs: 15_000 }),
				next: item(2, { isAuto: false }),
			}),
		},
		{
			why: "nothing was taken yet",
			state: stateWith({
				live: item(1, { scene: "bracket", durationMs: 15_000 }),
				takenAt: null,
			}),
		},
	])("is null when $why", ({ state }) => {
		expect(Producer.autoTakeAt(state)).toBeNull();
	});
});

describe("Producer.editItem", () => {
	test("changes only the given item", () => {
		const edited = Producer.editItem(
			stateWith({ queue: [item(3), item(4)] }),
			3,
			{ clipId: clip.id },
		);

		expect(edited?.queue.map((queued) => queued.clipId)).toEqual([
			clip.id,
			null,
		]);
		expect(edited?.next.clipId).toBeNull();
	});

	test("gives a scene picked its default duration", () => {
		const state = stateWith({});

		expect(
			Producer.editItem(state, 2, { scene: "bracket" })?.next.durationMs,
		).toBe(15_000);
		expect(
			Producer.editItem(
				stateWith({ next: item(2, { scene: "bracket", durationMs: 30_000 }) }),
				2,
				{ scene: "game" },
			)?.next.durationMs,
		).toBeNull();
	});

	test("is null for an item no longer staged", () => {
		expect(Producer.editItem(stateWith({}), 1, { swapSides: true })).toBeNull();
	});
});

describe("Producer.enqueue", () => {
	test("queues the scene following the last staged item with a new id", () => {
		const state = stateWith({ queue: [item(3, { scene: "bracket" })] });

		const queued = Producer.enqueue(state);

		expect(queued.queue.at(-1)).toMatchObject({
			id: state.lastItemId + 1,
			scene: "rosters",
		});
		expect(queued.lastItemId).toBe(state.lastItemId + 1);
	});
});

describe("Producer.removeItem", () => {
	test.each([
		{ why: "a queued item", itemId: 3, expected: [2, 4] },
		{ why: "next, staging the first queued", itemId: 2, expected: [3, 4] },
		{ why: "an item no longer staged", itemId: 1, expected: null },
	])("$why", ({ itemId, expected }) => {
		const state = stateWith({ queue: [item(3), item(4)] });

		expect(stagedIds(Producer.removeItem(state, itemId))).toEqual(expected);
	});

	test("keeps something staged", () => {
		expect(Producer.removeItem(stateWith({}), 2)).toBeNull();
	});
});

describe("Producer.moveItem", () => {
	test.each([
		{ why: "earlier", itemId: 3, direction: "earlier", expected: [3, 2, 4] },
		{ why: "later", itemId: 3, direction: "later", expected: [2, 4, 3] },
		{ why: "past the start", itemId: 2, direction: "earlier", expected: null },
		{ why: "past the end", itemId: 4, direction: "later", expected: null },
		{ why: "not staged", itemId: 1, direction: "later", expected: null },
	] as const)("$why", ({ itemId, direction, expected }) => {
		const state = stateWith({ queue: [item(3), item(4)] });

		expect(stagedIds(Producer.moveItem(state, itemId, direction))).toEqual(
			expected,
		);
	});
});

describe("Producer.withDefaults", () => {
	test("fills in the queue and the ids of a state stored before them", () => {
		const { queue, lastItemId, takenAt, ...current } = Producer.initialState();
		const stored = {
			...current,
			live: R.omit(current.live, ["id", "durationMs", "isAuto"]),
			next: R.omit(current.next, ["id", "durationMs", "isAuto"]),
		} as unknown as BroadcastStoredState;

		expect(Producer.withDefaults(stored)).toEqual(Producer.initialState());
	});
});
