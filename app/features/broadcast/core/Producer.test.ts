import * as R from "remeda";
import { describe, expect, test } from "vitest";
import { CAST_PRODUCER_RULES } from "~/features/broadcast-cast/broadcast-cast-constants";
import type {
	BroadcastClip,
	CastProducerState,
} from "~/features/broadcast-cast/broadcast-cast-types";
import { seededRandom } from "~/utils/random";
import type {
	BroadcastGameSummary,
	BroadcastInkRgb,
	BroadcastStoredState,
} from "../broadcast-types";
import * as Producer from "./Producer";

const rules = CAST_PRODUCER_RULES;

const ink = {
	key: "lockYellowPurple",
	matchId: 1,
	resultCount: 1,
} as const;

const clip: BroadcastClip = {
	id: "1-1790000000000",
	durationMs: 25_180,
	kills: 4,
	moments: ["splats"],
};

const TAKEN_AT = 1_000_000;
const NOW = 2_000_000;

const item = (
	id: number,
	overrides: Partial<CastProducerState> = {},
): CastProducerState => ({
	id,
	scene: "game",
	transition: "stinger",
	bracketIdx: null,
	bracketSides: { winners: "remaining", losers: "remaining" },
	clip: null,
	teamPick: "left",
	durationMs: null,
	advance: "timer",
	isAdvancePicked: false,
	...overrides,
});

const stateWith = ({
	live = item(1, { scene: "rosters" }),
	next = item(2),
	queue = [],
	takenAt = TAKEN_AT,
	swapSides = false,
}: {
	live?: CastProducerState;
	next?: CastProducerState;
	queue?: CastProducerState[];
	takenAt?: number | null;
	swapSides?: boolean;
}): BroadcastStoredState<CastProducerState> => ({
	takeId: 3,
	takenAt,
	takenBy: "producer",
	live,
	next,
	queue,
	lastItemId: Math.max(live.id, next.id, ...queue.map((queued) => queued.id)),
	liveResults: null,
	ink,
	swapSides,
	scannedGame: null,
	music: null,
});

const stagedIds = (state: BroadcastStoredState<CastProducerState> | null) =>
	state ? Producer.stagedItems(state).map((staged) => staged.id) : null;

describe("Producer.take", () => {
	test("puts the staged state on air and stages the following scene with the same settings, keeping the ink colors and sides", () => {
		const taken = Producer.take(
			rules,
			stateWith({
				next: item(2, {
					scene: "game",
					bracketIdx: 1,
					bracketSides: { winners: "hidden", losers: 2 },
				}),
				swapSides: true,
			}),
			{
				liveResults: { matchId: 1, count: 2 },
				now: 5,
				hasMatch: true,
				by: "producer",
			},
		);

		expect(taken).toEqual({
			takeId: 4,
			takenAt: 5,
			takenBy: "producer",
			live: item(2, {
				scene: "game",
				bracketIdx: 1,
				bracketSides: { winners: "hidden", losers: 2 },
			}),
			next: item(3, {
				scene: "results",
				bracketIdx: 1,
				bracketSides: { winners: "hidden", losers: 2 },
				advance: "game",
			}),
			queue: [],
			lastItemId: 3,
			liveResults: { matchId: 1, count: 2 },
			ink,
			swapSides: true,
			scannedGame: null,
			music: null,
		});
	});

	test("keeps the music playing", () => {
		const music = {
			tracks: [],
			startedAt: 1,
			pausedAtMs: null,
			volume: 40,
			shuffleSeed: null,
		};
		const taken = Producer.take(
			rules,
			{
				...stateWith({ next: item(2, { scene: "break" }) }),
				music,
			},
			{ liveResults: null, now: 5, hasMatch: true, by: "producer" },
		);

		expect(taken.music).toBe(music);
	});

	test("stages the first queued item", () => {
		const taken = Producer.take(
			rules,
			stateWith({
				next: item(2, { scene: "replays" }),
				queue: [item(3, { scene: "maps" }), item(4)],
			}),
			{ liveResults: null, now: 5, hasMatch: true, by: "producer" },
		);

		expect(taken.live.id).toBe(2);
		expect(stagedIds(taken)).toEqual([3, 4]);
		expect(taken.lastItemId).toBe(4);
	});

	test("stages the following scene without the clip played or the scene's duration", () => {
		const taken = Producer.take(
			rules,
			stateWith({ next: item(2, { scene: "bracket", durationMs: 20_000 }) }),
			{ liveResults: null, now: 5, hasMatch: true, by: "producer" },
		);

		expect(taken.next).toMatchObject({ scene: "rosters", durationMs: null });

		const afterClip = Producer.take(
			rules,
			stateWith({ next: item(2, { scene: "replays", clip }) }),
			{ liveResults: null, now: 5, hasMatch: true, by: "producer" },
		);

		expect(afterClip.next).toMatchObject({ scene: "game", clip: null });
	});
	test("stages starting soon in place of a scene showing the match's teams without a match", () => {
		const taken = Producer.take(rules, stateWith({ next: item(2) }), {
			liveResults: null,
			now: 5,
			hasMatch: false,
			by: "producer",
		});

		expect(taken.next).toMatchObject({ scene: "starting", advance: "game" });
	});

	test("stages what follows technical difficulties to wait for a Take, not for the game to start", () => {
		const taken = Producer.take(
			rules,
			stateWith({ next: item(2, { scene: "technical" }) }),
			{ liveResults: null, now: 5, hasMatch: true, by: "producer" },
		);

		expect(taken.next.scene).toBe("game");
		expect(Producer.effectiveAdvance(rules, taken.live, taken.next)).toBe(
			"take",
		);
	});
});

describe("Producer.lengthMs", () => {
	test.each([
		{
			why: "clip",
			item: item(1, { scene: "replays", clip }),
			expected: clip.durationMs,
		},
		{ why: "OBS footage", item: item(1, { scene: "replays" }), expected: null },
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
			live: item(1, { scene: "replays", clip, transition: "cut" }),
			next: item(2, { transition: "stinger" }),
		});

		expect(Producer.liveEndsAt(rules, state)).toBe(TAKEN_AT + clip.durationMs);
		expect(Producer.autoTakeAt(rules, state, { hasMatch: true })).toBe(
			TAKEN_AT + clip.durationMs - 704,
		);
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

		expect(Producer.autoTakeAt(rules, state, { hasMatch: true })).toBe(
			TAKEN_AT + 704 + 15_000,
		);
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
			why: "next waits for the game",
			state: stateWith({ next: item(2, { advance: "game" }) }),
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
		expect(Producer.autoTakeAt(rules, state, { hasMatch })).toBeNull();
	});
});

describe("Producer.isAutoTakeLapsed", () => {
	const catchUp = { from: NOW - 60_000, to: NOW + 1_000 };

	test.each([
		{ why: "not due yet", now: NOW - 1_000, expected: false },
		{ why: "just due", now: NOW, expected: false },
		{ why: "due a few seconds ago", now: NOW + 5_000, expected: false },
		{ why: "due longer ago", now: NOW + 5_001, expected: true },
		{
			why: "due long ago, within the catch-up",
			now: NOW + 60_000,
			catchUp,
			expected: false,
		},
		{
			why: "due long ago, before the catch-up",
			now: NOW + 60_000,
			catchUp: { ...catchUp, from: NOW + 1 },
			expected: true,
		},
		{
			why: "due long ago, after the catch-up",
			now: NOW + 60_000,
			catchUp: { ...catchUp, to: NOW - 1 },
			expected: true,
		},
	])("$why", ({ now, catchUp: window, expected }) => {
		expect(Producer.isAutoTakeLapsed(NOW, { now, catchUp: window })).toBe(
			expected,
		);
	});
});

describe("Producer.takeRefusal", () => {
	test.each([
		{
			why: "before the first Take",
			takenBy: null,
			sinceMs: null,
			expected: null,
		},
		{
			why: "right after a timer",
			takenBy: "timer",
			sinceMs: 1_499,
			expected: "afterAutoTake",
		},
		{
			why: "right after a game signal",
			takenBy: "game",
			sinceMs: 0,
			expected: "afterAutoTake",
		},
		{
			why: "a while after a timer",
			takenBy: "timer",
			sinceMs: 1_500,
			expected: null,
		},
		{
			why: "right after a producer's Take",
			takenBy: "producer",
			sinceMs: 499,
			expected: "afterTake",
		},
		{
			why: "a moment after a producer's Take",
			takenBy: "producer",
			sinceMs: 500,
			expected: null,
		},
	] as const)("$why", ({ takenBy, sinceMs, expected }) => {
		const state = {
			takenAt: sinceMs === null ? null : NOW - sinceMs,
			takenBy,
		};

		expect(Producer.takeRefusal(state, NOW)).toBe(expected);
	});
});

describe("Producer.liveStartedAt", () => {
	test("is null before the first Take", () => {
		expect(Producer.liveStartedAt(stateWith({ takenAt: null }))).toBeNull();
	});
});

describe("Producer.liveEndsAt", () => {
	test("is null for a scene without a length", () => {
		expect(
			Producer.liveEndsAt(
				rules,
				stateWith({ live: item(1, { scene: "game" }) }),
			),
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

describe("Producer.advanceOptions", () => {
	test.each([
		{
			why: "only a Take between scenes running until a Take, without a game",
			before: item(1, { scene: "casters" }),
			item: item(2, { scene: "bracket" }),
			expected: ["take"],
		},
		{
			why: "a timer after a scene with a length",
			before: item(1, { scene: "bracket", durationMs: 15_000 }),
			item: item(2, { scene: "casters" }),
			expected: ["take", "timer"],
		},
		{
			why: "a game event into a game",
			before: item(1, { scene: "rosters" }),
			item: item(2, { scene: "game" }),
			expected: ["take", "game"],
		},
		{
			why: "a game event out of a game",
			before: item(1, { scene: "game" }),
			item: item(2, { scene: "results" }),
			expected: ["take", "game"],
		},
	])("$why", ({ before, item: staged, expected }) => {
		expect(Producer.advanceOptions(rules, before, staged)).toEqual(expected);
	});
});

describe("Producer.applyGameSignal", () => {
	const liveResults = { matchId: 1, count: 2 };
	const summary: BroadcastGameSummary = {
		mode: "SZ",
		stageId: 10,
		isKnockout: false,
		winner: null,
		inks: [null, null],
		teams: [{ players: [] }, { players: [] }],
		objective: [],
	};
	const greenPink: [BroadcastInkRgb, BroadcastInkRgb] = [
		{ r: 163, g: 198, b: 67 },
		{ r: 170, g: 54, b: 161 },
	];

	test("colors the game and puts it on air as it starts", () => {
		const applied = Producer.applyGameSignal(
			rules,
			stateWith({ next: item(2, { advance: "game" }) }),
			{
				signal: { type: "start", inks: greenPink },
				liveResults,
				now: 5,
			},
		);

		expect(applied?.live.id).toBe(2);
		expect(applied?.liveResults).toEqual(liveResults);
		expect(applied?.ink).toEqual({
			key: "greenPink",
			matchId: 1,
			resultCount: 2,
		});
	});

	test("keeps what was read of the game that ended, which game of the set it was, and puts the scene after it on air", () => {
		const applied = Producer.applyGameSignal(
			rules,
			stateWith({
				live: item(1, { scene: "game" }),
				next: item(2, { scene: "results", advance: "game" }),
			}),
			{
				signal: { type: "end", trigger: "juddFlag", summary },
				liveResults,
				now: 5,
			},
		);

		expect(applied?.scannedGame).toEqual({
			...summary,
			matchId: 1,
			resultCount: 2,
			ink: null,
		});
		expect(applied?.live.id).toBe(2);
	});

	test("keeps the ink colors picked for the game with what was read of it", () => {
		const applied = Producer.applyGameSignal(
			rules,
			{ ...stateWith({}), ink: { ...ink, resultCount: 2 } },
			{
				signal: { type: "end", trigger: "hudGone", summary },
				liveResults,
				now: 5,
			},
		);

		expect(applied?.scannedGame?.ink).toEqual({ key: ink.key });
	});

	test("leaves what was read of a game without a match out", () => {
		const applied = Producer.applyGameSignal(rules, stateWith({}), {
			signal: { type: "end", trigger: "hudGone", summary },
			liveResults: null,
			now: 5,
		});

		expect(applied).toBeNull();
	});

	test("only colors the game when it waits for a Take", () => {
		const state = stateWith({ next: item(2, { advance: "take" }) });

		const applied = Producer.applyGameSignal(rules, state, {
			signal: { type: "start", inks: greenPink },
			liveResults,
			now: 5,
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
				signal: { type: "end", trigger: "juddFlag", summary },
				liveResults: null,
				now: 5,
			},
		);

		expect(applied).toBeNull();
	});

	test("puts the scene after the game on air as Judd raises the flag", () => {
		const applied = Producer.applyGameSignal(
			rules,
			stateWith({
				live: item(1, { scene: "game" }),
				next: item(2, { scene: "maps", advance: "game" }),
			}),
			{
				signal: { type: "end", trigger: "juddFlag", summary },
				liveResults,
				now: 5,
			},
		);

		expect(applied?.live).toMatchObject({ id: 2, scene: "maps" });
		expect(applied?.next).toMatchObject({ scene: "game", advance: "game" });
	});

	test("puts the game on air as soon as it starts", () => {
		const applied = Producer.applyGameSignal(
			rules,
			stateWith({ next: item(2, { advance: "game" }) }),
			{
				signal: { type: "start", inks: null },
				liveResults,
				now: NOW,
			},
		);

		expect(applied?.live.id).toBe(2);
		expect(applied?.takenAt).toBe(NOW);
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
			},
		);

		expect(applied?.live.id).toBe(1);
		expect(applied?.ink?.key).toBe("greenPink");
	});

	test.each([
		{
			why: "the game ending while a game is staged",
			state: stateWith({ next: item(2, { advance: "game" }) }),
			signal: { type: "end", trigger: "hudGone", summary: null } as const,
		},
		{
			why: "the game starting without ink read while a game is on air",
			state: stateWith({
				live: item(1, { scene: "game" }),
				next: item(2, { scene: "maps", advance: "game" }),
			}),
			signal: { type: "start", inks: null } as const,
		},
	])("is null for $why", ({ state, signal }) => {
		expect(
			Producer.applyGameSignal(rules, state, {
				signal,
				liveResults,
				now: 5,
			}),
		).toBeNull();
	});

	test("keeps the game on air as its HUD goes away", () => {
		const applied = Producer.applyGameSignal(
			rules,
			stateWith({
				live: item(1, { scene: "game" }),
				next: item(2, { scene: "results", advance: "game" }),
			}),
			{
				signal: { type: "end", trigger: "hudGone", summary },
				liveResults,
				now: 5,
			},
		);

		expect(applied?.live.id).toBe(1);
		expect(applied?.scannedGame).toMatchObject({ matchId: 1 });
	});

	test("leaves the ink colors of the game on air alone as it ends", () => {
		const gameInk = { ...ink, resultCount: 2 };
		const applied = Producer.applyGameSignal(
			rules,
			{
				...stateWith({ live: item(1, { scene: "game" }) }),
				ink: gameInk,
			},
			{
				signal: { type: "end", trigger: "hudGone", summary },
				liveResults,
				now: 5,
			},
		);

		expect(applied?.ink).toEqual(gameInk);
	});

	test("leaves what was read of the last game alone as the next one starts", () => {
		const scannedGame = {
			...summary,
			matchId: 1,
			resultCount: 1,
			ink: null,
		};
		const applied = Producer.applyGameSignal(
			rules,
			{ ...stateWith({ next: item(2, { advance: "game" }) }), scannedGame },
			{
				signal: { type: "start", inks: greenPink },
				liveResults,
				now: 5,
			},
		);

		expect(applied?.scannedGame).toEqual(scannedGame);
	});

	test("cuts on the flag without what was read of the game", () => {
		const applied = Producer.applyGameSignal(
			rules,
			stateWith({
				live: item(1, { scene: "game" }),
				next: item(2, { scene: "results", advance: "game" }),
			}),
			{
				signal: { type: "end", trigger: "juddFlag", summary: null },
				liveResults,
				now: 5,
			},
		);

		expect(applied?.live.id).toBe(2);
	});
});

describe("Producer.editItem", () => {
	test("changes only the given item", () => {
		const edited = Producer.editItem(
			rules,
			stateWith({ queue: [item(3), item(4)] }),
			3,
			{ clip },
		);

		expect(edited?.queue.map((queued) => queued.clip)).toEqual([clip, null]);
		expect(edited?.next.clip).toBeNull();
	});

	test("runs a scene picked until a Take", () => {
		expect(
			Producer.editItem(
				rules,
				stateWith({ next: item(2, { scene: "bracket", durationMs: 30_000 }) }),
				2,
				{ scene: "team" },
			)?.next.durationMs,
		).toBeNull();
	});

	test("makes the item staged after one changed to technical difficulties wait for a Take", () => {
		const state = stateWith({
			next: item(2, { scene: "rosters" }),
			queue: [item(3, { scene: "game", advance: "game" })],
		});

		const edited = Producer.editItem(rules, state, 2, { scene: "technical" })!;

		expect(
			Producer.effectiveAdvance(rules, edited.next, edited.queue[0]!),
		).toBe("take");
	});

	test("lets the producer pick the game start for the item after technical difficulties", () => {
		const state = stateWith({
			next: item(2, { scene: "technical" }),
			queue: [item(3, { scene: "game", advance: "game" })],
		});

		const edited = Producer.editItem(rules, state, 3, { advance: "game" })!;

		expect(
			Producer.effectiveAdvance(rules, edited.next, edited.queue[0]!),
		).toBe("game");
	});

	test("staging technical difficulties and going back leaves the following item's advance as it was", () => {
		const state = stateWith({
			next: item(2, { scene: "game", advance: "game" }),
			queue: [item(3, { scene: "results", advance: "game" })],
		});

		const standby = Producer.editItem(rules, state, 2, { scene: "technical" })!;
		const back = Producer.editItem(rules, standby, 2, { scene: "game" })!;

		expect(Producer.effectiveAdvance(rules, back.next, back.queue[0]!)).toBe(
			"game",
		);
	});

	test("leaves the following item's advance alone as next changes to a scene other than technical difficulties", () => {
		const state = stateWith({
			next: item(2, { scene: "rosters" }),
			queue: [item(3, { scene: "game", advance: "game" })],
		});

		const edited = Producer.editItem(rules, state, 2, { scene: "maps" })!;

		expect(edited.queue[0]).toEqual(state.queue[0]);
	});

	test("picking another scene for next after the live scene ran out waits for a Take", () => {
		const state = stateWith({
			live: item(1, { scene: "results", durationMs: 10_000 }),
			next: item(2, { scene: "maps", advance: "take", isAdvancePicked: true }),
		});

		const edited = Producer.editItem(rules, state, 2, { scene: "casters" })!;

		expect(edited.next.advance).toBe("take");
		expect(Producer.autoTakeAt(rules, edited, { hasMatch: true })).toBeNull();
	});

	test("gives a scene picked for an item that isn't held its default advance", () => {
		const state = stateWith({
			live: item(1, { scene: "results", durationMs: 10_000 }),
			next: item(2, { scene: "maps", advance: "game", isAdvancePicked: true }),
		});

		const edited = Producer.editItem(rules, state, 2, { scene: "casters" })!;

		expect(edited.next).toMatchObject({
			advance: "timer",
			isAdvancePicked: false,
		});
	});

	test("keeps the duration and Hold of an item given the scene it already has", () => {
		const state = stateWith({
			next: item(2, {
				scene: "bracket",
				durationMs: 20_000,
				advance: "take",
				isAdvancePicked: true,
			}),
		});

		const edited = Producer.editItem(rules, state, 2, { scene: "bracket" })!;

		expect(edited.next).toEqual(state.next);
	});

	test("gives an edited queued item its default advance after the item before it in the queue", () => {
		const state = stateWith({
			live: item(1, { scene: "bracket", durationMs: 15_000 }),
			next: item(2, { scene: "game", advance: "game" }),
			queue: [item(3, { scene: "maps", advance: "timer" })],
		});

		const edited = Producer.editItem(rules, state, 3, { scene: "results" })!;

		expect(edited.queue[0]?.advance).toBe("game");
	});

	test("marks an advance given as the producer's pick", () => {
		const edited = Producer.editItem(rules, stateWith({}), 2, {
			advance: "take",
		})!;

		expect(edited.next).toMatchObject({
			advance: "take",
			isAdvancePicked: true,
		});
	});

	test("is null for an item no longer staged", () => {
		expect(
			Producer.editItem(rules, stateWith({}), 1, { scene: "maps" }),
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

	test("queues what follows technical difficulties to wait for a Take", () => {
		const state = stateWith({ next: item(2, { scene: "technical" }) });

		const queued = Producer.enqueue(rules, state, { hasMatch: true });

		expect(queued.queue.at(-1)?.scene).toBe("game");
		expect(
			Producer.effectiveAdvance(rules, queued.next, queued.queue.at(-1)!),
		).toBe("take");
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
		{ why: "one earlier", itemId: 4, toIndex: 1, expected: [2, 4, 3, 5] },
		{ why: "to next", itemId: 5, toIndex: 0, expected: [5, 2, 3, 4] },
		{ why: "next to the end", itemId: 2, toIndex: 3, expected: [3, 4, 5, 2] },
		{ why: "to where it is", itemId: 3, toIndex: 1, expected: null },
		{ why: "past the end", itemId: 3, toIndex: 4, expected: null },
		{ why: "not staged", itemId: 1, toIndex: 0, expected: null },
	])("$why", ({ itemId, toIndex, expected }) => {
		const state = stateWith({ queue: [item(3), item(4), item(5)] });

		expect(stagedIds(Producer.moveItem(state, itemId, toIndex))).toEqual(
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

	test("fills in the fields of queued items stored before them", () => {
		const stored = stateWith({
			queue: [
				R.omit(item(3, { scene: "bracket" }), [
					"bracketSides",
				]) as CastProducerState,
			],
		});

		expect(Producer.withDefaults(rules, stored).queue).toEqual([
			item(3, {
				scene: "bracket",
				bracketSides: rules.initial.next.bracketSides,
			}),
		]);
	});

	test.each([
		{
			why: "the on-air item swapped them",
			itemSwapSides: true,
			expected: true,
		},
		{ why: "the on-air item didn't", itemSwapSides: false, expected: false },
	])(
		"keeps the sides of a state that stored them per item when $why",
		({ itemSwapSides, expected }) => {
			const { swapSides, ...current } = stateWith({});
			const stored = {
				...current,
				live: { ...current.live, swapSides: itemSwapSides },
			} as unknown as BroadcastStoredState<CastProducerState>;

			expect(Producer.withDefaults(rules, stored).swapSides).toBe(expected);
		},
	);

	test("prefers the broadcast's sides over the ones an item stored", () => {
		const state = stateWith({ swapSides: false });
		const stored = {
			...state,
			live: { ...state.live, swapSides: true },
		} as unknown as BroadcastStoredState<CastProducerState>;

		expect(Producer.withDefaults(rules, stored).swapSides).toBe(false);
	});
});

describe("Producer (random sequences)", () => {
	const SEEDS = 200;
	const STEPS = 80;
	const SCENES = Object.keys(rules.sceneAfter) as CastProducerState["scene"][];

	test.each(R.range(1, SEEDS + 1))(
		"only a Take, a game signal or a timer within the grace of its time changes live (seed %i)",
		(seed) => {
			const { randomInteger } = seededRandom(`producer-${seed}`);
			const pick = <T>(values: readonly T[]) =>
				values[randomInteger(values.length)]!;
			let state = stateWith({ takenAt: NOW });
			let now = NOW;
			let hasMatch = true;

			const fireDueTimer = () => {
				const takeAt = Producer.autoTakeAt(rules, state, { hasMatch });
				if (
					takeAt === null ||
					takeAt > now ||
					Producer.isAutoTakeLapsed(takeAt, { now })
				) {
					return;
				}

				expect(Producer.effectiveAdvance(rules, state.live, state.next)).toBe(
					"timer",
				);
				state = Producer.take(rules, state, {
					liveResults: null,
					now,
					hasMatch,
					by: "timer",
				});
			};

			for (let step = 0; step < STEPS; step++) {
				const before = state;
				const staged = Producer.stagedItems(state);
				const target = pick(staged);
				const op = pick([
					"scene",
					"duration",
					"advance",
					"enqueue",
					"remove",
					"move",
					"match",
					"signal",
					"take",
					"wait",
				] as const);

				let isEdit = true;
				let advancePatchedId: number | null = null;
				switch (op) {
					case "scene":
						state =
							Producer.editItem(rules, state, target.id, {
								scene: pick(SCENES),
							}) ?? state;
						break;
					case "duration":
						state =
							Producer.editItem(rules, state, target.id, {
								durationMs: pick([null, 10_000, 30_000]),
							}) ?? state;
						break;
					case "advance":
						advancePatchedId = target.id;
						state =
							Producer.editItem(rules, state, target.id, {
								advance: pick(["take", "timer", "game"] as const),
							}) ?? state;
						break;
					case "enqueue":
						state = Producer.enqueue(rules, state, { hasMatch });
						break;
					case "remove":
						state = Producer.removeItem(state, target.id) ?? state;
						break;
					case "move":
						state =
							Producer.moveItem(
								state,
								target.id,
								pick(R.range(0, staged.length)),
							) ?? state;
						break;
					case "match":
						hasMatch = !hasMatch;
						break;
					case "signal": {
						isEdit = false;
						const applied = Producer.applyGameSignal(rules, state, {
							signal: pick([
								{ type: "start", inks: null },
								{ type: "end", trigger: "juddFlag", summary: null },
							] as const),
							liveResults: hasMatch ? { matchId: 1, count: 0 } : null,
							now,
						});
						if (applied && applied.takeId !== state.takeId) {
							expect(
								Producer.effectiveAdvance(rules, state.live, state.next),
							).toBe("game");
						}
						state = applied ?? state;
						break;
					}
					case "take":
						isEdit = false;
						if (
							Producer.canTake(rules, state, { hasMatch }) &&
							Producer.takeRefusal(state, now) === null
						) {
							state = Producer.take(rules, state, {
								liveResults: null,
								now,
								hasMatch,
								by: "producer",
							});
						}
						break;
					case "wait":
						isEdit = false;
						for (let tick = 0; tick < pick([1, 5, 20]); tick++) {
							now += 1_000;
							fireDueTimer();
						}
						break;
				}

				if (isEdit) {
					expect(
						R.pick(state, ["live", "takeId", "takenAt", "takenBy"]),
					).toEqual(R.pick(before, ["live", "takeId", "takenAt", "takenBy"]));
					for (const held of Producer.stagedItems(before)) {
						const after = Producer.stagedItems(state).find(
							(candidate) => candidate.id === held.id,
						);
						if (
							held.advance === "take" &&
							after &&
							held.id !== advancePatchedId
						) {
							expect(after.advance).toBe("take");
						}
					}
				}
				fireDueTimer();
			}
		},
	);
});
