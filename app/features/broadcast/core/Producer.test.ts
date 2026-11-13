import * as R from "remeda";
import { describe, expect, test } from "vitest";
import {
	BROADCAST_PROTOTYPE_CLIPS,
	CAST_PRODUCER_RULES,
} from "~/features/broadcast-cast/broadcast-cast-constants";
import type { CastProducerState } from "~/features/broadcast-cast/broadcast-cast-types";
import type { BroadcastInkRgb, BroadcastStoredState } from "../broadcast-types";
import * as Producer from "./Producer";

const rules = CAST_PRODUCER_RULES;

const ink = {
	key: "lockYellowPurple",
	isFlipped: false,
	matchId: 1,
	resultCount: 1,
} as const;

const clip = BROADCAST_PROTOTYPE_CLIPS[0];

const TAKEN_AT = 1_000_000;
const NOW = 2_000_000;
const STINGER_OUT_MS = 704;

const item = (
	id: number,
	overrides: Partial<CastProducerState> = {},
): CastProducerState => ({
	id,
	scene: "game",
	swapSides: false,
	transition: "stinger",
	bracketIdx: null,
	bracketFocus: "remaining",
	clipId: null,
	teamPick: "left",
	durationMs: null,
	advance: "timer",
	...overrides,
});

const stateWith = ({
	live = item(1, { scene: "rosters" }),
	next = item(2),
	queue = [],
	takenAt = TAKEN_AT,
	gameCut = null,
}: {
	live?: CastProducerState;
	next?: CastProducerState;
	queue?: CastProducerState[];
	takenAt?: number | null;
	gameCut?: BroadcastStoredState["gameCut"];
}): BroadcastStoredState<CastProducerState> => ({
	takeId: 3,
	takenAt,
	live,
	next,
	queue,
	lastItemId: Math.max(live.id, next.id, ...queue.map((queued) => queued.id)),
	liveResults: null,
	ink,
	gameCut,
});

const stagedIds = (state: BroadcastStoredState<CastProducerState> | null) =>
	state ? Producer.stagedItems(state).map((staged) => staged.id) : null;

describe("Producer.take", () => {
	test("puts the staged state on air and stages the following scene with the same settings, keeping the ink colors", () => {
		const taken = Producer.take(
			rules,
			stateWith({
				next: item(2, {
					scene: "game",
					swapSides: true,
					bracketIdx: 1,
					bracketFocus: "losers",
				}),
			}),
			{ liveResults: { matchId: 1, count: 2 }, now: 5, hasMatch: true },
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
				scene: "results",
				swapSides: true,
				bracketIdx: 1,
				bracketFocus: "losers",
				advance: "game",
			}),
			queue: [],
			lastItemId: 3,
			liveResults: { matchId: 1, count: 2 },
			ink,
			gameCut: null,
		});
	});

	test("stages the first queued item", () => {
		const taken = Producer.take(
			rules,
			stateWith({
				next: item(2, { scene: "replays" }),
				queue: [item(3, { scene: "maps" }), item(4)],
			}),
			{ liveResults: null, now: 5, hasMatch: true },
		);

		expect(taken.live.id).toBe(2);
		expect(stagedIds(taken)).toEqual([3, 4]);
		expect(taken.lastItemId).toBe(4);
	});

	test("stages the following scene without the clip played or the scene's duration", () => {
		const taken = Producer.take(
			rules,
			stateWith({ next: item(2, { scene: "bracket", durationMs: 20_000 }) }),
			{ liveResults: null, now: 5, hasMatch: true },
		);

		expect(taken.next).toMatchObject({ scene: "rosters", durationMs: null });

		const afterClip = Producer.take(
			rules,
			stateWith({ next: item(2, { scene: "replays", clipId: clip.id }) }),
			{ liveResults: null, now: 5, hasMatch: true },
		);

		expect(afterClip.next).toMatchObject({ scene: "game", clipId: null });
	});
	test("stages starting soon in place of a scene showing the match's teams without a match", () => {
		const taken = Producer.take(rules, stateWith({ next: item(2) }), {
			liveResults: null,
			now: 5,
			hasMatch: false,
		});

		expect(taken.next).toMatchObject({ scene: "starting", advance: "game" });
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
		expect(Producer.lengthMs(rules, timed)).toBe(expected);
	});
});

describe("Producer.autoTakeAt", () => {
	test("hides the end of the clip behind the next stinger", () => {
		const state = stateWith({
			live: item(1, { scene: "replays", clipId: clip.id, transition: "cut" }),
			next: item(2, { transition: "stinger" }),
		});

		expect(Producer.liveEndsAt(rules, state)).toBe(TAKEN_AT + clip.durationMs);
		expect(
			Producer.autoTakeAt(rules, state, { hasMatch: true, gameDelayMs: 0 }),
		).toBe(TAKEN_AT + clip.durationMs - 704);
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

		expect(
			Producer.autoTakeAt(rules, state, { hasMatch: true, gameDelayMs: 0 }),
		).toBe(TAKEN_AT + 704 + 15_000);
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
				next: item(2, { advance: "take" }),
			}),
		},
		{
			why: "nothing was taken yet",
			state: stateWith({
				live: item(1, { scene: "bracket", durationMs: 15_000 }),
				takenAt: null,
			}),
		},
		{
			why: "next shows the match's teams without a match",
			state: stateWith({
				live: item(1, { scene: "bracket", durationMs: 15_000 }),
				next: item(2, { scene: "rosters" }),
			}),
			hasMatch: false,
		},
	])("is null when $why", ({ state, hasMatch = true }) => {
		expect(
			Producer.autoTakeAt(rules, state, { hasMatch, gameDelayMs: 0 }),
		).toBeNull();
	});

	test("lands the transition where the game started on the scanner's feed, later by the game delay", () => {
		const state = stateWith({
			next: item(2, { advance: "game" }),
			gameCut: { type: "start", at: NOW },
		});

		expect(
			Producer.autoTakeAt(rules, state, { hasMatch: true, gameDelayMs: 5_000 }),
		).toBe(NOW + 5_000 - STINGER_OUT_MS);
	});

	test.each([
		{ why: "the game wasn't seen", gameCut: null },
		{
			why: "the game was seen ending, not starting",
			gameCut: { type: "end", at: NOW } as const,
		},
	])("waits for the game start when $why", ({ gameCut }) => {
		const state = stateWith({ next: item(2, { advance: "game" }), gameCut });

		expect(
			Producer.autoTakeAt(rules, state, { hasMatch: true, gameDelayMs: 0 }),
		).toBeNull();
	});
});

describe("Producer.canTake", () => {
	test.each([
		{ why: "a match scene with a match", scene: "maps", hasMatch: true },
		{
			why: "a scene without the match's teams",
			scene: "bracket",
			hasMatch: false,
		},
	] as const)("takes $why", ({ scene, hasMatch }) => {
		const state = stateWith({ next: item(2, { scene }) });

		expect(Producer.canTake(rules, state, { hasMatch })).toBe(true);
	});

	test.each([
		{ why: "rosters", next: item(2, { scene: "rosters" }) },
		{
			why: "the team scene following a side",
			next: item(2, { scene: "team", teamPick: "right" }),
		},
	])("doesn't take $why without a match", ({ next }) => {
		expect(
			Producer.canTake(rules, stateWith({ next }), { hasMatch: false }),
		).toBe(false);
	});
});

describe("Producer.gameCue", () => {
	test.each([
		{ why: "into a game", before: "rosters", scene: "game", expected: "start" },
		{ why: "out of a game", before: "game", scene: "maps", expected: "end" },
		{ why: "game to game", before: "game", scene: "game", expected: null },
		{ why: "without a game", before: "maps", scene: "bracket", expected: null },
	] as const)("$why", ({ before, scene, expected }) => {
		expect(Producer.gameCue(rules, { scene: before }, { scene })).toBe(
			expected,
		);
	});
});

describe("Producer.effectiveAdvance", () => {
	test.each([
		{
			why: "a timer after a scene with a length",
			before: item(1, { scene: "bracket", durationMs: 15_000 }),
			item: item(2, { advance: "timer" }),
			expected: "timer",
		},
		{
			why: "a timer after a scene running until a Take",
			before: item(1, { scene: "rosters" }),
			item: item(2, { advance: "timer" }),
			expected: "take",
		},
		{
			why: "a game event into a game",
			before: item(1, { scene: "rosters" }),
			item: item(2, { advance: "game" }),
			expected: "game",
		},
		{
			why: "a game event between scenes without a game",
			before: item(1, { scene: "rosters" }),
			item: item(2, { scene: "bracket", advance: "game" }),
			expected: "take",
		},
	])("$why", ({ before, item: staged, expected }) => {
		expect(Producer.effectiveAdvance(rules, before, staged)).toBe(expected);
	});
});

describe("Producer.applyGameSignal", () => {
	const liveResults = { matchId: 1, count: 2 };
	const greenPink: [BroadcastInkRgb, BroadcastInkRgb] = [
		{ r: 163, g: 198, b: 67 },
		{ r: 170, g: 54, b: 161 },
	];

	test("colors the game and puts it on air as it starts", () => {
		const applied = Producer.applyGameSignal(
			rules,
			stateWith({ next: item(2, { advance: "game" }) }),
			{
				signal: { type: "start", agoMs: 0, inks: greenPink },
				liveResults,
				now: 5,
				gameDelayMs: 0,
			},
		);

		expect(applied?.live.id).toBe(2);
		expect(applied?.liveResults).toEqual(liveResults);
		expect(applied?.ink).toEqual({
			key: "greenPink",
			isFlipped: false,
			matchId: 1,
			resultCount: 2,
		});
	});

	test("keeps the sides the teams had earlier in the set", () => {
		const state = {
			...stateWith({ next: item(2, { advance: "game" }) }),
			ink: { ...ink, isFlipped: true },
		};

		const applied = Producer.applyGameSignal(rules, state, {
			signal: { type: "start", agoMs: 0, inks: greenPink },
			liveResults,
			now: 5,
			gameDelayMs: 0,
		});

		expect(applied?.ink?.isFlipped).toBe(true);
	});

	test("only colors the game when it waits for a Take", () => {
		const state = stateWith({ next: item(2, { advance: "take" }) });

		const applied = Producer.applyGameSignal(rules, state, {
			signal: { type: "start", agoMs: 0, inks: greenPink },
			liveResults,
			now: 5,
			gameDelayMs: 0,
		});

		expect(applied?.live.id).toBe(1);
		expect(applied?.ink?.key).toBe("greenPink");
	});

	test("leaves a scene showing the match's teams staged without a match", () => {
		const applied = Producer.applyGameSignal(
			rules,
			stateWith({
				live: item(1, { scene: "game" }),
				next: item(2, { scene: "results", advance: "game" }),
			}),
			{
				signal: { type: "end", agoMs: 0 },
				liveResults: null,
				now: 5,
				gameDelayMs: 0,
			},
		);

		expect(applied).toBeNull();
	});

	test("puts the scene after the game on air as it ends", () => {
		const applied = Producer.applyGameSignal(
			rules,
			stateWith({
				live: item(1, { scene: "game" }),
				next: item(2, { scene: "maps", advance: "game" }),
			}),
			{
				signal: { type: "end", agoMs: 0 },
				liveResults,
				now: 5,
				gameDelayMs: 0,
			},
		);

		expect(applied?.live).toMatchObject({ id: 2, scene: "maps" });
		expect(applied?.next).toMatchObject({ scene: "game", advance: "game" });
	});

	test("keeps a game start to cut to once the game delay has passed", () => {
		const applied = Producer.applyGameSignal(
			rules,
			stateWith({ next: item(2, { advance: "game" }) }),
			{
				signal: { type: "start", agoMs: 1_000, inks: null },
				liveResults,
				now: NOW,
				gameDelayMs: 5_000,
			},
		);

		expect(applied?.live.id).toBe(1);
		expect(applied?.gameCut).toEqual({ type: "start", at: NOW - 1_000 });
	});

	test("puts the game on air right away once the game delay has passed by the time it's seen", () => {
		const applied = Producer.applyGameSignal(
			rules,
			stateWith({ next: item(2, { advance: "game" }) }),
			{
				signal: { type: "start", agoMs: 6_000, inks: null },
				liveResults,
				now: NOW,
				gameDelayMs: 5_000,
			},
		);

		expect(applied?.live.id).toBe(2);
		expect(applied?.gameCut).toBeNull();
	});

	test("colors the game on air with the ink read after it started", () => {
		const applied = Producer.applyGameSignal(
			rules,
			stateWith({
				live: item(1, { scene: "game" }),
				next: item(2, { scene: "maps", advance: "game" }),
			}),
			{
				signal: { type: "ink", inks: greenPink },
				liveResults,
				now: 5,
				gameDelayMs: 0,
			},
		);

		expect(applied?.live.id).toBe(1);
		expect(applied?.ink?.key).toBe("greenPink");
	});

	test.each([
		{
			why: "the game ending while a game is staged",
			state: stateWith({ next: item(2, { advance: "game" }) }),
			signal: { type: "end", agoMs: 0 } as const,
		},
		{
			why: "the game starting without ink read while a game is on air",
			state: stateWith({
				live: item(1, { scene: "game" }),
				next: item(2, { scene: "maps", advance: "game" }),
			}),
			signal: { type: "start", agoMs: 0, inks: null } as const,
		},
	])("is null for $why", ({ state, signal }) => {
		expect(
			Producer.applyGameSignal(rules, state, {
				signal,
				liveResults,
				now: 5,
				gameDelayMs: 0,
			}),
		).toBeNull();
	});
});

describe("Producer.editItem", () => {
	test("changes only the given item", () => {
		const edited = Producer.editItem(
			rules,
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
			Producer.editItem(rules, state, 2, { scene: "bracket" })?.next.durationMs,
		).toBe(15_000);
		expect(
			Producer.editItem(
				rules,
				stateWith({ next: item(2, { scene: "bracket", durationMs: 30_000 }) }),
				2,
				{ scene: "game" },
			)?.next.durationMs,
		).toBeNull();
	});

	test("is null for an item no longer staged", () => {
		expect(
			Producer.editItem(rules, stateWith({}), 1, { swapSides: true }),
		).toBeNull();
	});
});

describe("Producer.enqueue", () => {
	test("queues the scene following the last staged item with a new id", () => {
		const state = stateWith({ queue: [item(3, { scene: "bracket" })] });

		const queued = Producer.enqueue(rules, state, { hasMatch: true });

		expect(queued.queue.at(-1)).toMatchObject({
			id: state.lastItemId + 1,
			scene: "rosters",
		});
		expect(queued.lastItemId).toBe(state.lastItemId + 1);
	});
	test("queues starting soon in place of a scene showing the match's teams without a match", () => {
		const state = stateWith({ queue: [item(3, { scene: "bracket" })] });

		const queued = Producer.enqueue(rules, state, { hasMatch: false });

		expect(queued.queue.at(-1)?.scene).toBe("starting");
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
		const { queue, lastItemId, takenAt, ...current } =
			Producer.initialState(rules);
		const stored = {
			...current,
			live: R.omit(current.live, ["id", "durationMs", "advance"]),
			next: R.omit(current.next, ["id", "durationMs", "advance"]),
		} as unknown as BroadcastStoredState<CastProducerState>;

		expect(Producer.withDefaults(rules, stored)).toEqual(
			Producer.initialState(rules),
		);
	});
});
