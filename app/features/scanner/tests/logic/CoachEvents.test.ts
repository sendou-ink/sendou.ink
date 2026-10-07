import { describe, expect, test } from "vitest";
import * as CoachEvents from "../../core/CoachEvents";
import type {
	ScannerMatch,
	ScannerMatchKill,
	ScannerMatchObjectiveSample,
	ScannerMatchPlayerFlags,
	ScannerMatchPlayerStatusSample,
} from "../../core/scanner-match";

const GAME_START_T = 100;

const NO_FLAGS: ScannerMatchPlayerFlags = [false, false, false, false];

function match(overrides: Partial<ScannerMatch> = {}): ScannerMatch {
	return {
		startsAt: GAME_START_T - 10,
		endsAt: GAME_START_T + 320,
		playedAt: null,
		lobby: "PRIVATE",
		mode: "TC",
		stage: 1,
		matchScores: null,
		replayCode: null,
		cast: false,
		objective: null,
		playerStatus: null,
		kills: [],
		teams: [{ players: [] }, { players: [] }],
		winner: null,
		pov: null,
		...overrides,
	};
}

function sample(
	t: number,
	score: [number, number],
	control: 0 | 1 | null,
	position?: number,
): ScannerMatchObjectiveSample {
	return {
		t,
		time: clockAt(t),
		score,
		penalty: [null, null],
		control,
		...(position !== undefined ? { position } : null),
	};
}

function objective(
	mode: "SZ" | "TC" | "RM" | "CB",
	...samples: ScannerMatchObjectiveSample[]
): ScannerMatch["objective"] {
	return { mode, samples };
}

/** an icon-strip read; flags list `[team, slot]` pairs */
function status(
	t: number,
	{
		special = [],
		dead = [],
	}: { special?: [0 | 1, number][]; dead?: [0 | 1, number][] } = {},
): ScannerMatchPlayerStatusSample {
	const flags = (pairs: [0 | 1, number][]) =>
		([0, 1] as const).map(
			(team) =>
				NO_FLAGS.map((_, slot) =>
					pairs.some(
						([flagTeam, flagSlot]) => flagTeam === team && flagSlot === slot,
					),
				) as ScannerMatchPlayerFlags,
		) as [ScannerMatchPlayerFlags, ScannerMatchPlayerFlags];
	return { t, time: clockAt(t), special: flags(special), dead: flags(dead) };
}

function kill(t: number): ScannerMatchKill {
	return { t, time: clockAt(t), name: null };
}

function clockAt(t: number) {
	return 300 - (t - GAME_START_T);
}

const typesOf = (events: CoachEvents.CoachEvent[]) =>
	events.map((event) => event.type);

const ofType = (
	events: CoachEvents.CoachEvent[],
	type: CoachEvents.CoachEventType,
) =>
	events
		.filter((event) => event.type === type)
		.map(({ start, end }) => ({ start, end }));

describe("CoachEvents.ofMatch", () => {
	test("a cast has no POV team and so no events", () => {
		const events = CoachEvents.ofMatch(
			match({
				cast: true,
				objective: objective(
					"TC",
					sample(100, [100, 100], null),
					sample(110, [100, 100], 0, 0),
					sample(120, [70, 100], 0, 30),
				),
			}),
			[],
		);

		expect(events).toEqual([]);
	});

	test("a held and advanced tower is a push, cut from the splat that opened it", () => {
		const events = CoachEvents.ofMatch(
			match({
				pov: { team: 0, index: 0 },
				winner: 0,
				objective: objective(
					"TC",
					sample(100, [100, 100], null),
					sample(130, [100, 100], 0, 0),
					sample(140, [75, 100], 0, 25),
					sample(145, [75, 100], null, 25),
				),
				playerStatus: {
					samples: [status(115), status(120, { dead: [[1, 2]] })],
				},
			}),
			[],
		);

		expect(ofType(events, "PUSH_OFFENSE")).toEqual([{ start: 115, end: 145 }]);
		expect(ofType(events, "PUSH_DEFENSE")).toEqual([]);
	});

	test.each([
		{
			why: "control too short",
			samples: [sample(130, [100, 100], 0, 0), sample(133, [70, 100], 0, 30)],
		},
		{
			why: "too little progress",
			samples: [
				sample(130, [100, 100], 0, 0),
				sample(140, [90, 100], 0, 10),
				sample(145, [90, 100], null, 10),
			],
		},
	])("no push with $why", ({ samples }) => {
		const events = CoachEvents.ofMatch(
			match({
				pov: { team: 0, index: 0 },
				objective: objective("TC", ...samples, sample(150, [70, 100], null)),
			}),
			[],
		);

		expect(ofType(events, "PUSH_OFFENSE")).toEqual([]);
	});

	test("the enemy's push is the POV team's push defense", () => {
		const events = CoachEvents.ofMatch(
			match({
				pov: { team: 1, index: 0 },
				winner: 0,
				objective: objective(
					"RM",
					sample(130, [100, 100], 0, 0),
					sample(140, [75, 100], 0, 25),
					sample(145, [75, 100], null, 25),
				),
			}),
			[],
		);

		expect(ofType(events, "PUSH_DEFENSE")).toEqual([{ start: 125, end: 145 }]);
		expect(ofType(events, "PUSH_OFFENSE")).toEqual([]);
	});

	test.each([
		{
			why: "the first push beat the loser's final count",
			enemyFinal: 75,
			start: 125,
		},
		{ why: "the loser got past the first push", enemyFinal: 65, start: 195 },
	])(
		"game-winning push is the one the game was won off: $why",
		({ enemyFinal, start }) => {
			const events = CoachEvents.ofMatch(
				match({
					pov: { team: 0, index: 0 },
					winner: 0,
					objective: objective(
						"TC",
						sample(130, [100, 100], 0, 0),
						sample(140, [70, 100], 0, 30),
						sample(145, [70, 100], null),
						sample(160, [70, 100], 1, 0),
						sample(170, [70, enemyFinal], 1, -(100 - enemyFinal)),
						sample(175, [70, enemyFinal], null),
						sample(200, [70, enemyFinal], 0, 0),
						sample(210, [40, enemyFinal], 0, 60),
						sample(215, [40, enemyFinal], null),
					),
				}),
				[],
			);

			expect(ofType(events, "PUSH_OFFENSE_GAME_WINNING")).toEqual([
				{ start, end: start + 20 },
			]);
			expect(ofType(events, "PUSH_DEFENSE_GAME_WINNING")).toEqual([]);
		},
	);

	test.each([
		{ team: 0 as const, expected: "OPENING_WON" },
		{ team: 1 as const, expected: "OPENING_LOST" },
	])("the first push decides the opening: team $team", ({ team, expected }) => {
		const events = CoachEvents.ofMatch(
			match({
				pov: { team: 0, index: 0 },
				objective: objective(
					"TC",
					sample(101, [100, 100], null),
					sample(130, [100, 100], team, 0),
					sample(140, [100, 100], team, team === 0 ? 30 : -30),
					sample(145, [100, 100], null),
				),
			}),
			[],
		);

		expect(ofType(events, expected as CoachEvents.CoachEventType)).toEqual([
			{ start: GAME_START_T, end: 135 },
		]);
	});

	test("no opening when the footage starts after it", () => {
		const events = CoachEvents.ofMatch(
			match({
				pov: { team: 0, index: 0 },
				objective: objective(
					"TC",
					sample(160, [100, 100], 0, 0),
					sample(170, [70, 100], 0, 30),
					sample(175, [70, 100], null),
				),
			}),
			[],
		);

		expect(typesOf(events)).not.toContain("OPENING_WON");
	});

	test("Clam Blitz's opening goes to the side splatting more in its first 45s", () => {
		const events = CoachEvents.ofMatch(
			match({
				mode: "CB",
				pov: { team: 0, index: 0 },
				objective: objective("CB", sample(101, [100, 100], null)),
				playerStatus: {
					samples: [
						status(101),
						status(110, { dead: [[1, 0]] }),
						status(120, { dead: [[1, 1]] }),
						status(130, { dead: [[0, 1]] }),
						status(150, { dead: [[0, 2]] }),
						status(160, { dead: [[0, 3]] }),
					],
				},
			}),
			[],
		);

		expect(ofType(events, "OPENING_WON")).toEqual([
			{ start: GAME_START_T, end: 145 },
		]);
	});

	test("Splat Zones holds, the best of them and the retake after the enemy's hold", () => {
		const events = CoachEvents.ofMatch(
			match({
				mode: "SZ",
				pov: { team: 1, index: 0 },
				objective: objective(
					"SZ",
					sample(101, [100, 100], null),
					sample(110, [100, 100], 1),
					sample(122, [100, 88], null),
					sample(130, [100, 88], 0),
					sample(140, [90, 88], 0),
					sample(150, [80, 88], null),
					sample(160, [80, 88], 1),
					sample(172, [80, 76], 1),
					sample(185, [80, 63], null),
				),
				playerStatus: {
					samples: [status(140), status(145, { dead: [[0, 3]] })],
				},
			}),
			[],
		);

		expect(ofType(events, "OPENING_WON")).toEqual([
			{ start: GAME_START_T, end: 120 },
		]);
		expect(ofType(events, "HOLD")).toEqual([
			{ start: 110, end: 122 },
			{ start: 160, end: 185 },
		]);
		expect(ofType(events, "BEST_HOLD")).toEqual([{ start: 160, end: 185 }]);
		expect(ofType(events, "RETAKE")).toEqual([{ start: 140, end: 170 }]);
	});

	test("a brief neutral zone doesn't split a hold", () => {
		const events = CoachEvents.ofMatch(
			match({
				mode: "SZ",
				pov: { team: 0, index: 0 },
				objective: objective(
					"SZ",
					sample(110, [100, 100], 0),
					sample(116, [94, 100], null),
					sample(118, [94, 100], 0),
					sample(125, [87, 100], null),
				),
			}),
			[],
		);

		expect(ofType(events, "HOLD")).toEqual([{ start: 110, end: 125 }]);
	});

	test("specials used close together stack; a special lost to a splat is no use", () => {
		const events = CoachEvents.ofMatch(
			match({
				pov: { team: 0, index: 0 },
				playerStatus: {
					samples: [
						status(150, {
							special: [
								[0, 0],
								[0, 1],
								[0, 2],
								[1, 0],
							],
						}),
						status(151, {
							special: [
								[0, 1],
								[0, 2],
							],
						}),
						status(155, { special: [[0, 2]] }),
						status(159),
						status(160, { dead: [[1, 0]] }),
					],
				},
			}),
			[],
		);

		expect(ofType(events, "SPECIAL_STACK_2")).toEqual([
			{ start: 146, end: 164 },
		]);
		expect(ofType(events, "SPECIAL_STACK_3")).toEqual([
			{ start: 146, end: 164 },
		]);
	});

	test("the POV player splatted while holding a special", () => {
		const events = CoachEvents.ofMatch(
			match({
				pov: { team: 0, index: 2 },
				playerStatus: {
					samples: [
						status(150, {
							special: [
								[0, 2],
								[0, 1],
							],
						}),
						status(151, { special: [[0, 1]] }),
						status(152, { special: [[0, 1]], dead: [[0, 2]] }),
						status(160, { dead: [[0, 1]] }),
					],
				},
			}),
			[],
		);

		expect(ofType(events, "DIED_WITH_SPECIAL")).toEqual([
			{ start: 142, end: 154 },
		]);
		expect(typesOf(events)).not.toContain("SPECIAL_STACK_2");
	});

	test("a death streak needs three deaths without a kill; repeated reads of a death count once", () => {
		const events = CoachEvents.ofMatch(
			match({
				pov: { team: 0, index: 0 },
				kills: [kill(170)],
				playerStatus: null,
			}),
			[110, 113, 130, 180, 200, 202, 220],
		);

		expect(ofType(events, "DEATH_STREAK")).toEqual([{ start: 170, end: 222 }]);
	});

	test("no death streak without a kill feed read", () => {
		const events = CoachEvents.ofMatch(
			match({ pov: { team: 0, index: 0 }, kills: null }),
			[110, 130, 150],
		);

		expect(events).toEqual([]);
	});
});
