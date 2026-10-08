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

describe("CoachEvents.lives", () => {
	const POV = { team: 0, index: 0 } as const;
	const povDead = { dead: [[0, 0]] as [0 | 1, number][] };
	const lifeStarts = (...args: Parameters<typeof CoachEvents.lives>) =>
		CoachEvents.lives(...args).map((life) => life.start);

	test("a game without deaths is one life", () => {
		expect(lifeStarts(match({ pov: POV }), [])).toEqual([GAME_START_T - 10]);
	});

	test("a respawn is the first icon-strip read showing the player back", () => {
		const lives = lifeStarts(
			match({
				pov: POV,
				playerStatus: {
					samples: [
						status(120),
						status(130, povDead),
						status(136, povDead),
						status(139),
					],
				},
			}),
			[129],
		);

		expect(lives).toEqual([GAME_START_T - 10, 139]);
	});

	test("a death the icon strip never showed respawns after the fallback", () => {
		const lives = lifeStarts(match({ pov: POV }), [150]);

		expect(lives).toEqual([GAME_START_T - 10, 158]);
	});

	test("a death at the end of the game starts no life", () => {
		const lives = lifeStarts(match({ pov: POV, endsAt: 200 }), [195]);

		expect(lives).toEqual([GAME_START_T - 10]);
	});

	test("a cast has only the game's start", () => {
		const lives = lifeStarts(match({ cast: true, winner: 0 }), [150]);

		expect(lives).toEqual([GAME_START_T - 10]);
	});

	test("a cast's life has no summary", () => {
		const lives = CoachEvents.lives(match({ cast: true, winner: 0 }), [150]);

		expect(lives.map((life) => life.summary)).toEqual([null]);
	});

	test("the first life is timed from the game clock's start and ends at the death", () => {
		const [first] = CoachEvents.lives(
			match({
				pov: POV,
				playerStatus: { samples: [status(GAME_START_T + 5)] },
			}),
			[150],
		);

		expect(first!.summary).toMatchObject({ duration: 50 });
	});

	test("the last life ends with the game", () => {
		const lives = CoachEvents.lives(match({ pov: POV, endsAt: 400 }), [150]);

		expect(lives[1]!.summary!.duration).toBe(400 - 158);
	});

	test("a kill on the death's second belongs to the life that ended", () => {
		const lives = CoachEvents.lives(
			match({ pov: POV, kills: [kill(120), kill(150), kill(152), kill(170)] }),
			[150],
		);

		expect(lives.map((life) => life.summary!.kills!.map(({ t }) => t))).toEqual(
			[
				[120, 150],
				[152, 170],
			],
		);
	});

	test("no kills without a kill feed read", () => {
		const [first] = CoachEvents.lives(match({ pov: POV, kills: null }), []);

		expect(first!.summary!.kills).toBeNull();
	});

	test("counts the POV player's specials used and marks a death holding one", () => {
		const povSpecial = { special: [[0, 0]] as [0 | 1, number][] };
		const lives = CoachEvents.lives(
			match({
				pov: POV,
				playerStatus: {
					samples: [
						status(110, povSpecial),
						status(115),
						status(130, povSpecial),
						status(135, povDead),
						status(145),
						status(160, povSpecial),
						status(165),
					],
				},
			}),
			[134],
		);

		expect(
			lives.map(({ summary }) => [
				summary!.specialsUsed,
				summary!.diedWithSpecial,
			]),
		).toEqual([
			[1, true],
			[1, false],
		]);
	});

	test("no specials count without the POV seat", () => {
		const [first] = CoachEvents.lives(match(), []);

		expect(first!.summary!.specialsUsed).toBeNull();
	});

	test("in a count mode, control is how far each side's count went down", () => {
		const lives = CoachEvents.lives(
			match({
				pov: POV,
				objective: objective(
					"TC",
					sample(110, [100, 90], 1),
					sample(130, [80, 90], 0),
					sample(160, [70, 85], 1),
				),
			}),
			[140],
		);

		expect(lives.map((life) => life.summary!.control)).toEqual([
			{ unit: "POINTS", ours: 20, theirs: 10 },
			{ unit: "POINTS", ours: 10, theirs: 5 },
		]);
	});

	test("in Splat Zones, control is how long each side held the zone", () => {
		const [first] = CoachEvents.lives(
			match({
				pov: POV,
				mode: "SZ",
				objective: objective(
					"SZ",
					sample(110, [100, 100], 0),
					sample(122, [88, 100], null),
					sample(130, [88, 100], 1),
					sample(135, [88, 95], 1),
				),
			}),
			[132],
		);

		expect(first!.summary!.control).toEqual({
			unit: "SECONDS",
			ours: 12,
			theirs: 2,
		});
	});

	test("no control in Turf War", () => {
		const [first] = CoachEvents.lives(
			match({
				pov: POV,
				mode: "TW",
				objective: objective("SZ", sample(110, [100, 100], 0)),
			}),
			[],
		);

		expect(first!.summary!.control).toBeNull();
	});
});
