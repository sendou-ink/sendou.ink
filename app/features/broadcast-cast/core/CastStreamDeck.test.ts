import { describe, expect, test } from "vitest";
import * as StreamDeck from "~/modules/stream-deck/stream-deck";
import {
	BROADCAST_SCENE_GROUPS,
	DEFAULT_CAST_BROADCAST_SETTINGS,
} from "../broadcast-cast-constants";
import { broadcastDesignSearchParams } from "../broadcast-cast-search-params";
import type {
	CastBroadcastState,
	CastProducerState,
} from "../broadcast-cast-types";
import * as CastStreamDeck from "./CastStreamDeck";
import * as DesignScenario from "./DesignScenario";

const TAKEN_AT = 1_000_000;

describe("CastStreamDeck.keys", () => {
	test("has the twelve scenes in the scene picker's order, then the queue item, the advance and Take", () => {
		const keys = CastStreamDeck.keys({
			state: stateOf(),
			selected: item(),
			now: TAKEN_AT,
		});

		expect(keys).toHaveLength(3 * StreamDeck.COLUMNS);
		expect(
			keys.slice(0, 12).map((key) => (key.type === "scene" ? key.scene : null)),
		).toEqual(BROADCAST_SCENE_GROUPS.flatMap((group) => group.scenes));
		expect(keys.slice(12).map((key) => key.type)).toEqual([
			"queueItem",
			"advance",
			"take",
		]);
	});

	test("marks the scene on air and the selected item's scene", () => {
		const state = stateOf();
		state.live = item({ scene: "casters" });

		const keys = CastStreamDeck.keys({
			state,
			selected: item({ scene: "bracket" }),
			now: TAKEN_AT,
		});

		expect(sceneKey(keys, "casters")).toMatchObject({
			isLive: true,
			isSelected: false,
		});
		expect(sceneKey(keys, "bracket")).toMatchObject({
			isLive: false,
			isSelected: true,
		});
	});

	test("disables the match scenes while no match is cast", () => {
		const state = stateOf();
		state.match = null;

		const keys = CastStreamDeck.keys({
			state,
			selected: item(),
			now: TAKEN_AT,
		});

		expect(sceneKey(keys, "rosters").isDisabled).toBe(true);
		expect(sceneKey(keys, "casters").isDisabled).toBe(false);
	});

	test.each([
		{
			why: "next",
			selectedId: 2,
			position: 0,
			scene: "casters",
			nextItemId: 3,
		},
		{
			why: "a queued item",
			selectedId: 3,
			position: 1,
			scene: "bracket",
			nextItemId: 4,
		},
		{
			why: "the last item, back to next",
			selectedId: 4,
			position: 2,
			scene: "break",
			nextItemId: 2,
		},
	] as const)(
		"shows which queue item is edited and moves on from $why",
		({ selectedId, position, scene, nextItemId }) => {
			const state = stateOf();
			state.queue = [
				item({ id: 3, scene: "bracket" }),
				item({ id: 4, scene: "break" }),
			];
			const selected = [state.next, ...state.queue].find(
				(staged) => staged.id === selectedId,
			)!;

			const keys = CastStreamDeck.keys({ state, selected, now: TAKEN_AT });

			expect(keyOf(keys, "queueItem")).toEqual({
				type: "queueItem",
				position,
				count: 3,
				scene,
				nextItemId,
				isDisabled: false,
			});
		},
	);

	test("queues a new item from next when it is the only one", () => {
		const state = stateOf();

		const keys = CastStreamDeck.keys({
			state,
			selected: state.next,
			now: TAKEN_AT,
		});

		expect(keyOf(keys, "queueItem")).toMatchObject({
			position: 0,
			count: 1,
			nextItemId: null,
		});
	});

	test.each([
		{
			why: "only a Take between scenes without a length or game",
			before: item({ scene: "casters" }),
			selected: item({ id: 2, scene: "bracket" }),
			expected: {
				advance: "take",
				nextAdvance: "take",
				gameCue: null,
				isDisabled: true,
			},
		},
		{
			why: "a Take to the timer after a scene with a length",
			before: item({ scene: "bracket", durationMs: 15_000 }),
			selected: item({ id: 2, scene: "casters" }),
			expected: { advance: "take", nextAdvance: "timer", isDisabled: false },
		},
		{
			why: "the timer back to a Take",
			before: item({ scene: "bracket", durationMs: 15_000 }),
			selected: item({ id: 2, scene: "casters", advance: "timer" }),
			expected: { advance: "timer", nextAdvance: "take", isDisabled: false },
		},
		{
			why: "a game start back to a Take",
			before: item({ scene: "rosters" }),
			selected: item({ id: 2, scene: "game", advance: "game" }),
			expected: { advance: "game", nextAdvance: "take", gameCue: "start" },
		},
		{
			why: "a Take to the game end out of a game",
			before: item({ scene: "game" }),
			selected: item({ id: 2, scene: "results" }),
			expected: { advance: "take", nextAdvance: "game", isDisabled: false },
		},
	] as const)("cycles the advance: $why", ({ before, selected, expected }) => {
		const state = stateOf();
		state.live = before;
		state.next = selected;

		const keys = CastStreamDeck.keys({ state, selected, now: TAKEN_AT });

		expect(keyOf(keys, "advance")).toMatchObject({ itemId: 2, ...expected });
	});

	test("cycles the advance of a queued item after the item before it, not after the scene on air", () => {
		const state = stateOf();
		state.live = item({ scene: "casters" });
		state.next = item({ id: 2, scene: "rosters" });
		const queued = item({ id: 3, scene: "game" });
		state.queue = [queued];

		const keys = CastStreamDeck.keys({
			state,
			selected: queued,
			now: TAKEN_AT,
		});

		expect(keyOf(keys, "advance")).toMatchObject({
			itemId: 3,
			nextAdvance: "game",
			isDisabled: false,
		});
	});

	test("counts Take down while next goes on air by itself, imminent in its last seconds", () => {
		const state = stateOf();
		state.live = item({ scene: "casters", durationMs: 60_000 });
		state.next = item({ id: 2, scene: "rosters", advance: "timer" });

		const early = keyOf(
			CastStreamDeck.keys({ state, selected: state.next, now: TAKEN_AT }),
			"take",
		);
		const late = keyOf(
			CastStreamDeck.keys({
				state,
				selected: state.next,
				now: TAKEN_AT + 57_000,
			}),
			"take",
		);

		expect(early).toMatchObject({ remainingMs: 60_000, isImminent: false });
		expect(late).toMatchObject({ remainingMs: 3_000, isImminent: true });
	});

	test.each([
		{
			why: "a match scene staged without a match blocks Take",
			setup: (state: CastBroadcastState) => {
				state.match = null;
				state.live = item({ scene: "casters", durationMs: 60_000 });
				state.next = item({ id: 2, scene: "rosters", advance: "timer" });
			},
			now: TAKEN_AT,
			take: {
				isDisabled: true,
				remainingMs: null,
				gameCue: null,
				isImminent: false,
			},
		},
		{
			why: "results waiting for the game to end without a match block Take and have no game cue",
			setup: (state: CastBroadcastState) => {
				state.match = null;
				state.live = item({ scene: "game" });
				state.next = item({ id: 2, scene: "results", advance: "game" });
			},
			now: TAKEN_AT,
			take: {
				isDisabled: true,
				remainingMs: null,
				gameCue: null,
				isImminent: false,
			},
		},
		{
			why: "next waiting for a Take",
			setup: (state: CastBroadcastState) => {
				state.next = item({ id: 2, scene: "casters", advance: "take" });
			},
			now: TAKEN_AT,
			take: { isDisabled: false, remainingMs: null, gameCue: null },
		},
		{
			why: "next waiting for the game to start",
			setup: (state: CastBroadcastState) => {
				state.live = item({ scene: "maps" });
				state.next = item({ id: 2, scene: "game", advance: "game" });
			},
			now: TAKEN_AT,
			take: { isDisabled: false, remainingMs: null, gameCue: "start" },
		},
		{
			why: "next waiting for the game to end",
			setup: (state: CastBroadcastState) => {
				state.live = item({ scene: "game" });
				state.next = item({ id: 2, scene: "results", advance: "game" });
			},
			now: TAKEN_AT,
			take: { isDisabled: false, remainingMs: null, gameCue: "end" },
		},
		{
			why: "a timed next before the clock is synced",
			setup: (state: CastBroadcastState) => {
				state.live = item({ scene: "casters", durationMs: 60_000 });
				state.next = item({ id: 2, scene: "rosters", advance: "timer" });
			},
			now: null,
			take: {
				isDisabled: false,
				remainingMs: null,
				gameCue: null,
				isImminent: false,
			},
		},
	])("Take: $why", ({ setup, now, take }) => {
		const state = stateOf();
		setup(state);

		const keys = CastStreamDeck.keys({ state, selected: state.next, now });

		expect(keyOf(keys, "take")).toMatchObject(take);
	});
});

function stateOf(): CastBroadcastState {
	const state = DesignScenario.build({
		scenario: broadcastDesignSearchParams.parse(new URLSearchParams()),
		tournament: { name: "In The Zone", logoUrl: "/logo.png" },
		settings: DEFAULT_CAST_BROADCAST_SETTINGS,
		takenAt: TAKEN_AT,
	});
	state.live = item({ scene: "casters" });
	state.next = item({ id: 2, scene: "casters" });

	return state;
}

function item(patch: Partial<CastProducerState> = {}): CastProducerState {
	return {
		id: 1,
		scene: "casters",
		swapSides: false,
		transition: "cut",
		bracketIdx: null,
		bracketFocus: "remaining",
		clipId: null,
		teamPick: "left",
		durationMs: null,
		advance: "take",
		...patch,
	};
}

function sceneKey(keys: CastStreamDeck.Key[], scene: string) {
	const key = keys.find(
		(candidate) => candidate.type === "scene" && candidate.scene === scene,
	);
	if (key?.type !== "scene") throw new Error(`no key for ${scene}`);

	return key;
}

function keyOf<Type extends Exclude<CastStreamDeck.Key["type"], "scene">>(
	keys: CastStreamDeck.Key[],
	type: Type,
) {
	const key = keys.find((candidate) => candidate.type === type);
	if (!key) throw new Error(`no ${type} key`);

	return key as Extract<CastStreamDeck.Key, { type: Type }>;
}
