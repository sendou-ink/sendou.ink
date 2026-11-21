import { describe, expect, test } from "vitest";
import { DEFAULT_CAST_BROADCAST_SETTINGS } from "../broadcast-cast-constants";
import { broadcastDesignSearchParams } from "../broadcast-cast-search-params";
import type {
	CastBroadcastState,
	CastProducerState,
} from "../broadcast-cast-types";
import * as CastTake from "./CastTake";
import * as DesignScenario from "./DesignScenario";

const TAKEN_AT = 1_000_000;

describe("CastTake.status", () => {
	test("counts Take down while next goes on air by itself, imminent in its last seconds", () => {
		const state = stateOf();
		state.live = item({ scene: "casters", durationMs: 60_000 });
		state.next = item({ id: 2, scene: "rosters", advance: "timer" });

		const early = CastTake.status({ state, now: TAKEN_AT });
		const late = CastTake.status({ state, now: TAKEN_AT + 57_000 });

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
				canTake: false,
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
				canTake: false,
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
			take: { canTake: true, remainingMs: null, gameCue: null },
		},
		{
			why: "next waiting for the game to start",
			setup: (state: CastBroadcastState) => {
				state.live = item({ scene: "maps" });
				state.next = item({ id: 2, scene: "game", advance: "game" });
			},
			now: TAKEN_AT,
			take: { canTake: true, remainingMs: null, gameCue: "start" },
		},
		{
			why: "next waiting for the game to end",
			setup: (state: CastBroadcastState) => {
				state.live = item({ scene: "game" });
				state.next = item({ id: 2, scene: "results", advance: "game" });
			},
			now: TAKEN_AT,
			take: { canTake: true, remainingMs: null, gameCue: "end" },
		},
		{
			why: "a timed next before the clock is synced",
			setup: (state: CastBroadcastState) => {
				state.live = item({ scene: "casters", durationMs: 60_000 });
				state.next = item({ id: 2, scene: "rosters", advance: "timer" });
			},
			now: null,
			take: {
				canTake: true,
				remainingMs: null,
				gameCue: null,
				isImminent: false,
			},
		},
	])("$why", ({ setup, now, take }) => {
		const state = stateOf();
		setup(state);

		expect(CastTake.status({ state, now })).toMatchObject(take);
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
		bracketSides: { winners: "remaining", losers: "remaining" },
		clipId: null,
		teamPick: "left",
		durationMs: null,
		advance: "take",
		...patch,
	};
}
