/**
 * Cue timing over cast VoDs: each fixture in fixtures/game-cues holds what a
 * linked broadcast's GameCues got around the games of one VoD (recorded with
 * `pnpm scanner:scan-vod <video> --cues <file>`, the rows from 10s before a
 * start to 20s after, from 50s before an end, or as far back as the timer's
 * last seconds, to 12s after) and the moment each happened, labelled by hand
 * off the footage: the first frame of the intro splash, the first frame the
 * HUD is gone for "GAME!". Replayed with the link's one-second ticks, every
 * cue must put its cut point (`t`) at the label and fire no later than the
 * VoD allows, so tuning the cues can't drift.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { MAP_START_EVENT_TYPE } from "../../core/detectors/map-start/index";
import { OBJECTIVE_EVENT_TYPE } from "../../core/detectors/objective/index";
import { PLAYER_STATUS_EVENT_TYPE } from "../../core/detectors/objective/player-status";
import type { DetectedEvent } from "../../core/detectors/types";
import * as GameCues from "../../core/GameCues";

const FIXTURES_DIR = new URL("../fixtures/game-cues", import.meta.url).pathname;
/** Seconds the cut point may sit off the label: reads come a quarter to a whole second apart. */
const CUT_TOLERANCE_SECONDS = 1;

type Rgb = [number, number, number];

/** What the link got, as `scan-vod --cues` writes it. */
type Row =
	| ["intro", number]
	| ["open", number]
	| ["time", number, number | null]
	| [
			"hud",
			number,
			number | null,
			[number | null, number | null],
			[Rgb | null, Rgb | null],
	  ];

interface Window {
	cue: "start" | "end";
	/** When the game started or ended in the footage, seconds. */
	label: number;
	/** What happened there, e.g. a knockout or overtime. */
	note: string;
	rows: Row[];
}

interface VodFixture {
	video: string;
	/** Seconds after the label each kind of cue fires at the latest on this VoD. */
	maxLateSeconds: Record<Window["cue"], number>;
	windows: Window[];
}

const windows = readdirSync(FIXTURES_DIR)
	.filter((file) => file.endsWith(".json"))
	.flatMap((file) => {
		const vod = JSON.parse(
			readFileSync(join(FIXTURES_DIR, file), "utf8"),
		) as VodFixture;

		return vod.windows.map((window) => ({
			...window,
			vod: file.replace(/\.json$/, ""),
			maxLateSeconds: vod.maxLateSeconds[window.cue],
		}));
	});

describe("GameCues.step", () => {
	test("has cast VoD fixtures", () => {
		expect(windows.length).toBeGreaterThan(0);
	});

	test.each(windows)(
		"$vod: $cue at $label s ($note)",
		({ cue, label, rows, maxLateSeconds }) => {
			const first = replay(rows).find((given) => given.type === cue);

			expect(first, "no cue").toBeDefined();
			expect(Math.abs(first!.t - label)).toBeLessThanOrEqual(
				CUT_TOLERANCE_SECONDS,
			);
			expect(first!.at - label).toBeLessThanOrEqual(maxLateSeconds);
		},
	);
});

/** The cues the rows give, ticked every whole second as the link does, each with when it was given. */
function replay(rows: Row[]) {
	let state = GameCues.initialState();
	const given: Array<GameCues.GameCue & { at: number }> = [];
	const feed = (input: GameCues.GameCuesInput, at: number) => {
		const stepped = GameCues.step(state, input);
		state = stepped.state;
		given.push(...stepped.cues.map((cue) => ({ ...cue, at })));
	};

	let tick = Math.ceil(rows[0]![1]);
	const lastT = rows.at(-1)![1];
	for (const row of rows) {
		for (; tick <= row[1]; tick++) feed({ kind: "tick", t: tick }, tick);
		feed(toInput(row), row[1]);
	}
	for (; tick <= lastT + 10; tick++) feed({ kind: "tick", t: tick }, tick);

	return given.filter(
		(cue): cue is Extract<typeof cue, { t: number }> => cue.type !== "ink",
	);
}

function toInput(row: Row): GameCues.GameCuesInput {
	switch (row[0]) {
		case "open":
			return { kind: "mapOpen", t: row[1] };
		case "intro":
			return { kind: "event", event: event(MAP_START_EVENT_TYPE, row[1], {}) };
		case "time":
			return {
				kind: "event",
				event: event(OBJECTIVE_EVENT_TYPE, row[1], { time: row[2] }),
			};
		case "hud": {
			const [, t, time, teamHue, teamInk] = row;
			return {
				kind: "event",
				event: event(PLAYER_STATUS_EVENT_TYPE, t, {
					time,
					teamHue,
					teamInk: teamInk.map((ink) =>
						ink ? { r: ink[0], g: ink[1], b: ink[2] } : null,
					),
				}),
			};
		}
	}
}

/** An event with only the data GameCues reads. */
function event(type: string, t: number, data: object): DetectedEvent {
	return { type, t, confidence: 1, data } as DetectedEvent;
}
