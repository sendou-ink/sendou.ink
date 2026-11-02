import { describe, expect, test } from "vitest";
import { MAP_START_EVENT_TYPE } from "../../core/detectors/map-start/index";
import {
	OBJECTIVE_EVENT_TYPE,
	type ObjectiveData,
	type TrackObjectiveData,
} from "../../core/detectors/objective/index";
import {
	PLAYER_STATUS_EVENT_TYPE,
	type PlayerStatusData,
} from "../../core/detectors/objective/player-status";
import type { DetectedEvent } from "../../core/detectors/types";
import * as GameCues from "../../core/GameCues";

const LIME = 76;
const PINK = 304;
const ORANGE = 18;

const NO_FLAGS = [false, false, false, false] as const;

type ZonesObjectiveData = Exclude<ObjectiveData, TrackObjectiveData>;

const mapStart = (t: number): DetectedEvent => ({
	type: MAP_START_EVENT_TYPE,
	t,
	confidence: 1,
	data: { mode: "SZ", stage: 1 },
});

/** One HUD read: the counter, then the icon strip paired with it, as the objective detector emits them. */
const hud = (
	t: number,
	{
		time = 200,
		score = [100, 100],
		teamHue = [LIME, PINK],
	}: Partial<
		Pick<ZonesObjectiveData, "time" | "score"> &
			Pick<PlayerStatusData, "teamHue">
	> = {},
): DetectedEvent[] => [
	{
		type: OBJECTIVE_EVENT_TYPE,
		t,
		confidence: 1,
		data: {
			mode: "SZ",
			time,
			score,
			penalty: [null, null],
			control: null,
			teamColor: [null, null],
		} satisfies ZonesObjectiveData,
	},
	{
		type: PLAYER_STATUS_EVENT_TYPE,
		t,
		confidence: 1,
		data: {
			time,
			special: [[...NO_FLAGS], [...NO_FLAGS]],
			dead: [[...NO_FLAGS], [...NO_FLAGS]],
			cast: null,
			teamHue,
		} satisfies PlayerStatusData,
	},
];

/** The cues given along the inputs, each with the time of the input that gave it. */
function run(
	inputs: Array<
		DetectedEvent | DetectedEvent[] | number | GameCues.GameCuesInput
	>,
) {
	let state = GameCues.initialState();
	const cues: Array<GameCues.GameCue & { at: number }> = [];

	for (const input of inputs.flat()) {
		const stepped = GameCues.step(
			state,
			typeof input === "number"
				? { kind: "tick", t: input }
				: "kind" in input
					? input
					: { kind: "event", event: input },
		);
		state = stepped.state;
		const at =
			typeof input === "number"
				? input
				: "kind" in input
					? input.kind === "event"
						? input.event.t
						: input.t
					: input.t;
		cues.push(...stepped.cues.map((cue) => ({ ...cue, at })));
	}

	return cues;
}

describe("GameCues.step", () => {
	test("starts the game with its ink once the HUD shows it twice", () => {
		expect(run([mapStart(0), hud(10), hud(11), hud(12)])).toEqual([
			{ type: "start", hues: [LIME, PINK], at: 11 },
		]);
	});

	test("counts the ink read with the sides flipped as the same", () => {
		expect(
			run([hud(10), hud(11, { teamHue: [PINK, LIME] })]).map((cue) => cue.type),
		).toEqual(["start"]);
	});

	test("waits for two reads of the same ink", () => {
		expect(
			run([hud(10, { teamHue: [ORANGE, PINK] }), hud(11), hud(12)]),
		).toEqual([{ type: "start", hues: [LIME, PINK], at: 12 }]);
	});

	test("starts off the icons alone, as in Turf War", () => {
		const statusOnly = (t: number) => hud(t).slice(1);

		expect(run([statusOnly(10), statusOnly(11)])).toEqual([
			{ type: "start", hues: [LIME, PINK], at: 11 },
		]);
	});

	test("starts without ink once the HUD has been up a while with none read", () => {
		const cues = run(
			Array.from({ length: 6 }, (_, i) =>
				hud(10 + i, { teamHue: [null, PINK] }),
			),
		);

		expect(cues).toEqual([{ type: "start", hues: null, at: 15 }]);
	});

	test("ends the game shortly after the HUD is gone once the timer ran out", () => {
		const cues = run([
			hud(10),
			hud(11, { time: 1 }),
			hud(12, { time: 0 }),
			14,
			15,
		]);

		expect(cues.at(-1)).toEqual({ type: "end", t: 12, at: 15 });
	});

	test("ends a knocked out game once the HUD has been gone a while", () => {
		const cues = run([hud(10), hud(11, { time: 120 }), 14, 17]);

		expect(cues.slice(1)).toEqual([{ type: "end", t: 11, at: 17 }]);
	});

	test("keeps the game on through a short gap in the HUD", () => {
		const cues = run([hud(10), hud(11), 15, hud(16), 20]);

		expect(cues.map((cue) => cue.type)).toEqual(["start"]);
	});

	test("keeps the game on while an observer has the map open", () => {
		const cues = run([
			hud(10),
			hud(11),
			{ kind: "mapOpen", t: 15 },
			{ kind: "mapOpen", t: 20 },
			24,
		]);

		expect(cues.map((cue) => cue.type)).toEqual(["start"]);
	});

	test("doesn't take one misread timer for the time running out", () => {
		const cues = run([hud(10), hud(11, { time: 1 }), 15]);

		expect(cues.map((cue) => cue.type)).toEqual(["start"]);
	});

	test("keeps the game on while the HUD is up in overtime", () => {
		const cues = run([
			hud(10),
			hud(11, { time: 1 }),
			hud(12, { time: 0 }),
			hud(14, { time: null }),
			hud(16, { time: null }),
			18,
		]);

		expect(cues.map((cue) => cue.type)).toEqual(["start"]);
	});

	test("starts the next game after one ended", () => {
		const cues = run([
			hud(10),
			hud(11, { time: 1 }),
			hud(12, { time: 0 }),
			20,
			mapStart(200),
			hud(210),
			hud(211),
		]);

		expect(cues.map((cue) => cue.type)).toEqual(["start", "end", "start"]);
	});
});
