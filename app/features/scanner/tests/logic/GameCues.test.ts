import { describe, expect, test } from "vitest";
import { JUDD_FLAG_EVENT_TYPE } from "../../core/detectors/judd/index";
import { MAP_START_EVENT_TYPE } from "../../core/detectors/map-start/index";
import {
	OBJECTIVE_EVENT_TYPE,
	type ObjectiveData,
	type TrackObjectiveData,
} from "../../core/detectors/objective/index";
import {
	FLAGGED_STATE_EVIDENCE,
	PLAYER_STATUS_EVENT_TYPE,
	type PlayerStatusData,
} from "../../core/detectors/objective/player-status";
import type { DetectedEvent } from "../../core/events";
import * as GameCues from "../../core/GameCues";

const LIME = { hue: 76, ink: { r: 163, g: 198, b: 67 } };
const PINK = { hue: 304, ink: { r: 170, g: 54, b: 161 } };
const ORANGE = { hue: 18, ink: { r: 191, g: 86, b: 40 } };

type Team = typeof LIME;

const ALL_ALIVE = [
	FLAGGED_STATE_EVIDENCE.alive,
	FLAGGED_STATE_EVIDENCE.alive,
	FLAGGED_STATE_EVIDENCE.alive,
	FLAGGED_STATE_EVIDENCE.alive,
] satisfies PlayerStatusData["slots"][0];

type ZonesObjectiveData = Exclude<ObjectiveData, TrackObjectiveData>;

const mapStart = (t: number): DetectedEvent => ({
	type: MAP_START_EVENT_TYPE,
	t,
	scores: { read: 1 },
	data: { mode: "SZ", stage: 1 },
});

const juddFlag = (t: number): DetectedEvent => ({
	type: JUDD_FLAG_EVENT_TYPE,
	t,
	scores: { "inks,winnerInk": 1 },
	data: { inks: [LIME.ink], winnerInk: LIME.ink },
});

/** One HUD read: the counter, then the icon strip paired with it, as the objective detector emits them. */
const hud = (
	t: number,
	{
		time = 200,
		score = [100, 100],
		teams = [LIME, PINK],
	}: Partial<
		Pick<ZonesObjectiveData, "time" | "score"> & {
			teams: [Team | null, Team | null];
		}
	> = {},
): DetectedEvent[] => [
	{
		type: OBJECTIVE_EVENT_TYPE,
		t,
		scores: { read: 1 },
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
		scores: { read: 1 },
		data: {
			time,
			slots: [ALL_ALIVE, ALL_ALIVE],
			cast: null,
			teamHue: [teams[0]?.hue ?? null, teams[1]?.hue ?? null],
			teamInk: [teams[0]?.ink ?? null, teams[1]?.ink ?? null],
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
	test("starts the game at its intro, its ink following once the HUD shows it twice", () => {
		expect(run([mapStart(0), mapStart(1), hud(10), hud(11), hud(12)])).toEqual([
			{ type: "start", t: 0, inks: null, at: 0 },
			{ type: "ink", inks: [LIME.ink, PINK.ink], at: 11 },
		]);
	});

	test("starts the game at its HUD with its ink when the intro wasn't read", () => {
		expect(run([hud(10), hud(11), hud(12)])).toEqual([
			{ type: "start", t: 11, inks: [LIME.ink, PINK.ink], at: 11 },
		]);
	});

	test("counts the ink read with the sides flipped as the same", () => {
		expect(
			run([hud(10), hud(11, { teams: [PINK, LIME] })]).map((cue) => cue.type),
		).toEqual(["start"]);
	});

	test("waits for two reads of the same ink", () => {
		expect(run([hud(10, { teams: [ORANGE, PINK] }), hud(11), hud(12)])).toEqual(
			[{ type: "start", t: 12, inks: [LIME.ink, PINK.ink], at: 12 }],
		);
	});

	test("starts off the icons alone, as in Turf War", () => {
		const statusOnly = (t: number) => hud(t).slice(1);

		expect(run([statusOnly(10), statusOnly(11)])).toEqual([
			{ type: "start", t: 11, inks: [LIME.ink, PINK.ink], at: 11 },
		]);
	});

	test("starts without ink once the HUD has been up a while with none read", () => {
		const cues = run(
			Array.from({ length: 6 }, (_, i) => hud(10 + i, { teams: [null, PINK] })),
		);

		expect(cues).toEqual([{ type: "start", t: 15, inks: null, at: 15 }]);
	});

	test("gives no ink after the intro when the HUD shows none", () => {
		const cues = run([
			mapStart(0),
			...Array.from({ length: 8 }, (_, i) =>
				hud(10 + i, { teams: [null, PINK] }),
			),
		]);

		expect(cues.map((cue) => cue.type)).toEqual(["start"]);
	});

	test("waits for the HUD after the intro", () => {
		const cues = run([mapStart(0), 10, 20, hud(21), hud(22)]);

		expect(cues.map((cue) => cue.type)).toEqual(["start", "ink"]);
	});

	test("takes back an intro whose HUD never showed", () => {
		expect(run([mapStart(0), 29, 30])).toEqual([
			{ type: "start", t: 0, inks: null, at: 0 },
			{ type: "end", trigger: "hudGone", t: 0, isTimeUp: false, at: 30 },
		]);
	});

	test("starts the next game on an intro read after the HUD showed, as a replay watched again", () => {
		const cues = run([
			mapStart(0),
			hud(10),
			hud(11),
			mapStart(12),
			hud(20),
			hud(21),
		]);

		expect(cues).toEqual([
			{ type: "start", t: 0, inks: null, at: 0 },
			{ type: "ink", inks: [LIME.ink, PINK.ink], at: 11 },
			{ type: "start", t: 12, inks: null, at: 12 },
			{ type: "ink", inks: [LIME.ink, PINK.ink], at: 21 },
		]);
	});

	test("starts the next game as the game clock jumps back up, its intro missed", () => {
		const cues = run([
			hud(10, { time: 120 }),
			hud(11, { time: 119 }),
			hud(12, { time: 290 }),
			hud(13, { time: 289 }),
		]);

		expect(cues).toEqual([
			{ type: "start", t: 11, inks: [LIME.ink, PINK.ink], at: 11 },
			{ type: "start", t: 12, inks: null, at: 12 },
			{ type: "ink", inks: [LIME.ink, PINK.ink], at: 13 },
		]);
	});

	test("starts the game once on an intro read several times", () => {
		const cues = run([mapStart(0), mapStart(0.5), mapStart(1), hud(10)]);

		expect(cues.map((cue) => cue.type)).toEqual(["start"]);
	});

	test("ends the game shortly after the HUD is gone once the timer ran out", () => {
		const cues = run([
			hud(10),
			hud(11, { time: 1 }),
			hud(12, { time: 0 }),
			14,
			15,
		]);

		expect(cues.at(-1)).toEqual({
			type: "end",
			trigger: "hudGone",
			t: 12,
			isTimeUp: true,
			at: 15,
		});
	});

	test("ends a knocked out game once the HUD has been gone a while", () => {
		const cues = run([hud(10), hud(11, { time: 120 }), 14, 17]);

		expect(cues.slice(1)).toEqual([
			{ type: "end", trigger: "hudGone", t: 11, isTimeUp: false, at: 17 },
		]);
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

		expect(cues.map((cue) => cue.type)).toEqual([
			"start",
			"end",
			"end",
			"start",
			"ink",
		]);
	});

	test("ends the game again as Judd raises the flag after its HUD is gone", () => {
		const cues = run([
			hud(10),
			hud(11, { time: 1 }),
			hud(12, { time: 0 }),
			15,
			juddFlag(20),
			juddFlag(20.5),
			40,
		]);

		expect(cues.slice(1)).toEqual([
			{ type: "end", trigger: "hudGone", t: 12, isTimeUp: true, at: 15 },
			{ type: "end", trigger: "juddFlag", t: 20, isTimeUp: true, at: 20 },
		]);
	});

	test("ends the game on Judd's flag read before the HUD counts as gone", () => {
		const cues = run([hud(10), hud(11, { time: 120 }), 13, juddFlag(14)]);

		expect(cues.slice(1)).toEqual([
			{ type: "end", trigger: "hudGone", t: 11, isTimeUp: false, at: 14 },
			{ type: "end", trigger: "juddFlag", t: 14, isTimeUp: false, at: 14 },
		]);
	});

	test("ignores Judd's flag read with the HUD only just gone", () => {
		const cues = run([hud(10), hud(11), juddFlag(12), hud(13)]);

		expect(cues.map((cue) => cue.type)).toEqual(["start"]);
	});

	test("ignores Judd's flag read with no game on", () => {
		expect(run([juddFlag(10), 20])).toEqual([]);
	});

	test("gives up on Judd's flag a while after the HUD is gone", () => {
		const cues = run([hud(10), hud(11, { time: 120 }), 17, 26, 27, 28]);

		expect(cues.slice(1)).toEqual([
			{ type: "end", trigger: "hudGone", t: 11, isTimeUp: false, at: 17 },
			{ type: "end", trigger: "juddFlag", t: 27, isTimeUp: false, at: 27 },
		]);
	});

	test("gives up on Judd's flag as the next game starts", () => {
		const cues = run([hud(10), hud(11, { time: 120 }), 17, mapStart(20)]);

		expect(cues.slice(1)).toEqual([
			{ type: "end", trigger: "hudGone", t: 11, isTimeUp: false, at: 17 },
			{ type: "end", trigger: "juddFlag", t: 20, isTimeUp: false, at: 20 },
			{ type: "start", t: 20, inks: null, at: 20 },
		]);
	});

	test("waits for no flag after an intro whose HUD never showed", () => {
		const cues = run([mapStart(0), 30, 60]);

		expect(cues.map((cue) => cue.type)).toEqual(["start", "end"]);
	});
});
