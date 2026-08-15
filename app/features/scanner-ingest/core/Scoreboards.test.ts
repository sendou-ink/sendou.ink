import { describe, expect, test } from "vitest";
import type {
	ScannerMatch,
	ScannerMatchObjective,
	ScannerMatchPlayer,
	ScannerMatchPlayerStatus,
} from "~/features/scanner/core/scanner-match";
import type { ScannerLobby } from "~/features/scanner/scanner-types";
import type {
	AbilityWithUnknown,
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import * as Scoreboards from "./Scoreboards";
import { NAMES } from "./tests/fixtures";

const WINNER_TEAM_ID = 100;
const LOSER_TEAM_ID = 200;

function testGame(
	partial: Partial<Scoreboards.IngestableGame> & {
		matchGameResultId?: number;
		tournamentMatchId?: number;
	} = {},
): Scoreboards.IngestableGame {
	const { matchGameResultId = 11, tournamentMatchId = 1, ...rest } = partial;
	return {
		target: { type: "tournament", matchGameResultId, tournamentMatchId },
		mapIndex: 0,
		mode: "SZ",
		stageId: 0 as StageId,
		winnerUserIds: [],
		loserUserIds: [],
		winnerInGameNames: [],
		loserInGameNames: [],
		playedAt: 1000,
		linkedPlayerNames: null,
		...rest,
	};
}

function gameResultId(matched: Scoreboards.MatchedGame): number | null {
	return matched.game.target.type === "tournament"
		? matched.game.target.matchGameResultId
		: null;
}

function tournamentMatchIdOf(matched: Scoreboards.MatchedGame): number | null {
	return matched.game.target.type === "tournament"
		? matched.game.target.tournamentMatchId
		: null;
}

function testMatch({
	t = 60,
	mode = "SZ",
	stage = 0,
	lobby = "PRIVATE",
	names = NAMES,
	weapons = [10, 10, 10, 10, 20, 20, 20, 20] as (MainWeaponId | null)[],
	abilities = {},
	povIndex = null,
	objective = null,
	playerStatus = null,
}: {
	t?: number;
	mode?: ModeShort | null;
	stage?: StageId | null;
	lobby?: ScannerLobby | null;
	names?: string[];
	weapons?: (MainWeaponId | null)[];
	abilities?: Record<number, AbilityWithUnknown[][]>;
	povIndex?: number | null;
	objective?: ScannerMatchObjective | null;
	playerStatus?: ScannerMatchPlayerStatus | null;
} = {}): ScannerMatch {
	const players = names.map(
		(name, i): ScannerMatchPlayer => ({
			name: name || null,
			weaponId: weapons[i]!,
			paint: 1000,
			ka: 10,
			d: 5,
			s: 2,
			...(abilities[i] ? { abilities: abilities[i] } : null),
		}),
	);
	return {
		startsAt: t,
		endsAt: t,
		playedAt: null,
		lobby,
		mode,
		stage,
		matchScores: [100, 52],
		replayCode: null,
		cast: false,
		objective,
		playerStatus,
		teams: [{ players: players.slice(0, 4) }, { players: players.slice(4) }],
		winner: 0,
		pov:
			povIndex === null
				? null
				: { team: povIndex < 4 ? 0 : 1, index: povIndex % 4 },
	};
}

function testObjective(): ScannerMatchObjective {
	return {
		mode: "SZ",
		samples: [
			{
				t: 600,
				time: 300,
				score: [100, 100],
				penalty: [null, null],
				control: [false, false],
			},
			{
				t: 630,
				time: 270,
				score: [80, 100],
				penalty: [null, 12],
				control: [true, false],
			},
		],
	};
}

function testPlayerStatus(): ScannerMatchPlayerStatus {
	return {
		samples: [
			{
				t: 595,
				time: 305,
				special: [
					[true, false, false, false],
					[false, false, false, false],
				],
				dead: [
					[false, false, false, false],
					[false, true, false, false],
				],
			},
		],
	};
}

/** The same game reported with sides in the other on-screen order. */
function swapSides(match: ScannerMatch): ScannerMatch {
	return {
		...match,
		teams: [match.teams[1], match.teams[0]],
		objective:
			match.objective === null
				? null
				: {
						...match.objective,
						samples: match.objective.samples.map((sample) => ({
							...sample,
							score: [sample.score[1], sample.score[0]],
							penalty: [sample.penalty[1], sample.penalty[0]],
							control: [sample.control[1], sample.control[0]],
						})),
					},
		playerStatus:
			match.playerStatus === null
				? null
				: {
						samples: match.playerStatus.samples.map((sample) => ({
							...sample,
							special: [sample.special[1], sample.special[0]],
							dead: [sample.dead[1], sample.dead[0]],
						})),
					},
		winner: match.winner === null ? null : match.winner === 0 ? 1 : 0,
		matchScores:
			match.matchScores === null
				? null
				: [match.matchScores[1], match.matchScores[0]],
		pov:
			match.pov === null
				? null
				: { ...match.pov, team: match.pov.team === 0 ? 1 : 0 },
	};
}

describe("matchedGames", () => {
	test("matches a game's match and reports its index", () => {
		const matched = Scoreboards.matchedGames({
			matches: [testMatch()],
			games: [testGame()],
		});

		expect(matched).toHaveLength(1);
		expect(matched[0]!.matchIndex).toBe(0);
		expect(gameResultId(matched[0]!)).toBe(11);
	});

	test("skips matches without a known winner", () => {
		const matched = Scoreboards.matchedGames({
			matches: [{ ...testMatch(), winner: null }],
			games: [testGame()],
		});

		expect(matched).toHaveLength(0);
	});

	test("skips matches whose teams were not fully seen", () => {
		const partial = testMatch();
		partial.teams[1].players.pop();
		const matched = Scoreboards.matchedGames({
			matches: [partial],
			games: [testGame()],
		});

		expect(matched).toHaveLength(0);
	});

	test("skips a game whose linked scoreboard has different players", () => {
		const matched = Scoreboards.matchedGames({
			matches: [testMatch()],
			games: [
				testGame({
					matchGameResultId: 11,
					linkedPlayerNames: ["a", "b", "c", "d", "e", "f", "g", "h"],
				}),
				testGame({ matchGameResultId: 12, playedAt: 2000 }),
			],
		});

		expect(matched.map(gameResultId)).toEqual([12]);
	});

	test("matches a re-detection of a linked scoreboard to the same game despite misread names", () => {
		const matched = Scoreboards.matchedGames({
			matches: [testMatch()],
			games: [
				testGame({
					matchGameResultId: 11,
					linkedPlayerNames: ["w1", "w2", "w3", "wA", "l1", "l2", "l3", "lB"],
				}),
				testGame({ matchGameResultId: 12, playedAt: 2000 }),
			],
		});

		expect(matched.map(gameResultId)).toEqual([11]);
	});

	test("does not count unreadable names towards linked scoreboard re-detection", () => {
		const matched = Scoreboards.matchedGames({
			matches: [testMatch({ names: ["", "", "", "", "l1", "l2", "l3", "l4"] })],
			games: [
				testGame({
					matchGameResultId: 11,
					linkedPlayerNames: ["", "", "", "", "l1", "l2", "l3", "l4"],
				}),
				testGame({ matchGameResultId: 12, playedAt: 2000 }),
			],
		});

		expect(matched.map(gameResultId)).toEqual([12]);
	});

	test("matches matches to games by mode and stage", () => {
		const matched = Scoreboards.matchedGames({
			matches: [testMatch({ mode: "RM", stage: 1, t: 60 })],
			games: [
				testGame({ mapIndex: 0, mode: "SZ", stageId: 0 as StageId }),
				testGame({ mapIndex: 1, mode: "RM", stageId: 1 as StageId }),
			],
		});

		expect(matched.map((m) => m.game.mapIndex)).toEqual([1]);
	});

	test("assigns two games on the same mode and stage in chronological order", () => {
		const matched = Scoreboards.matchedGames({
			matches: [
				testMatch({
					t: 60,
					names: ["a", "b", "c", "d", "e", "f", "g", "h"],
				}),
				testMatch({
					t: 5000,
					names: ["i", "j", "k", "l", "m", "n", "o", "p"],
				}),
			],
			games: [
				testGame({ tournamentMatchId: 1, playedAt: 1000 }),
				testGame({ tournamentMatchId: 2, playedAt: 2000 }),
			],
		});

		expect(matched.map((m) => [m.matchIndex, tournamentMatchIdOf(m)])).toEqual([
			[0, 1],
			[1, 2],
		]);
	});

	test("skips duplicate detections of the same game", () => {
		const matched = Scoreboards.matchedGames({
			matches: [testMatch({ t: 60 }), testMatch({ t: 65 })],
			games: [
				testGame({ tournamentMatchId: 1, playedAt: 1000 }),
				testGame({ tournamentMatchId: 2, playedAt: 2000 }),
			],
		});

		expect(matched).toHaveLength(1);
		expect(tournamentMatchIdOf(matched[0]!)).toBe(1);
	});

	test("skips a duplicate detection despite a couple of OCR-misread names", () => {
		const matched = Scoreboards.matchedGames({
			matches: [
				testMatch({ t: 60 }),
				testMatch({
					t: 65,
					names: ["w1", "vv2", "w3", "w4", "l1", "l2", "l3", "I4"],
				}),
			],
			games: [
				testGame({ tournamentMatchId: 1, playedAt: 1000 }),
				testGame({ tournamentMatchId: 2, playedAt: 2000 }),
			],
		});

		expect(matched).toHaveLength(1);
		expect(tournamentMatchIdOf(matched[0]!)).toBe(1);
	});

	test("skips matches from other lobbies", () => {
		const matched = Scoreboards.matchedGames({
			matches: [testMatch({ lobby: "X" })],
			games: [testGame()],
		});

		expect(matched).toHaveLength(0);
	});

	test("skips matches with unreadable mode or stage", () => {
		const matched = Scoreboards.matchedGames({
			matches: [testMatch({ mode: null }), testMatch({ stage: null })],
			games: [testGame()],
		});

		expect(matched).toHaveLength(0);
	});

	test("skips matches that have no matching game left", () => {
		const matched = Scoreboards.matchedGames({
			matches: [
				testMatch({ t: 60 }),
				testMatch({
					t: 5000,
					names: ["i", "j", "k", "l", "m", "n", "o", "p"],
				}),
			],
			games: [testGame()],
		});

		expect(matched).toHaveLength(1);
	});

	test("skips a game whose known rosters contradict the match sides", () => {
		const matched = Scoreboards.matchedGames({
			matches: [testMatch()],
			games: [
				testGame({
					tournamentMatchId: 1,
					// match winners are w1-w4 but this game was won by the l* players
					winnerInGameNames: ["l1#1234", "l2"],
					loserInGameNames: ["w1", "w2"],
					playedAt: 1000,
				}),
				testGame({
					tournamentMatchId: 2,
					winnerInGameNames: ["w1", "w2"],
					loserInGameNames: ["l1#1234", "l2"],
					playedAt: 2000,
				}),
			],
		});

		expect(matched.map(tournamentMatchIdOf)).toEqual([2]);
	});

	test("pins the sides via the POV sender's roster, overruling contradicting names", () => {
		const matched = Scoreboards.matchedGames({
			matches: [
				testMatch({
					// names read flipped, but the sender's seat is on the winning rows
					names: ["l1", "l2", "l3", "l4", "w1", "w2", "w3", "w4"],
					povIndex: 0,
				}),
			],
			games: [
				testGame({
					winnerUserIds: [77],
					loserUserIds: [88],
					winnerInGameNames: ["w1", "w2"],
					loserInGameNames: ["l1", "l2"],
				}),
			],
			povUserId: 77,
		});

		expect(matched).toHaveLength(1);
	});

	test("skips a game seating the POV sender on the wrong side", () => {
		const matched = Scoreboards.matchedGames({
			matches: [testMatch({ povIndex: 4 })],
			games: [testGame({ winnerUserIds: [77], loserUserIds: [88] })],
			// the sender won the game, yet the read has their seat on the losing rows
			povUserId: 77,
		});

		expect(matched).toHaveLength(0);
	});

	test("falls back to the name check when the sender is in neither roster", () => {
		const matched = Scoreboards.matchedGames({
			matches: [testMatch({ povIndex: 0 })],
			games: [
				testGame({
					winnerUserIds: [77],
					loserUserIds: [88],
					winnerInGameNames: ["l1", "l2"],
					loserInGameNames: ["w1", "w2"],
				}),
			],
			povUserId: 99,
		});

		expect(matched).toHaveLength(0);
	});

	test("matches known in-game names ignoring discriminator, case and unicode width", () => {
		const matched = Scoreboards.matchedGames({
			matches: [
				testMatch({
					names: ["Ｗ１", "w2", "w3", "w4", "l1", "l2", "l3", "l4"],
				}),
			],
			games: [
				testGame({
					winnerInGameNames: ["w1#1234"],
					loserInGameNames: ["W3#5678"],
				}),
			],
		});

		// "Ｗ１" matches winner roster "w1#1234" straight (1) but "w3" on the
		// winning side would match the loser roster flipped (1); straight wins ties
		expect(matched).toHaveLength(1);
	});

	test("does not assign a game played before the previously assigned one", () => {
		const matched = Scoreboards.matchedGames({
			matches: [
				testMatch({ t: 60, mode: "RM", stage: 1 }),
				testMatch({ t: 1000, mode: "SZ", stage: 0 }),
			],
			games: [
				testGame({
					tournamentMatchId: 1,
					mode: "SZ",
					stageId: 0 as StageId,
					playedAt: 1000,
				}),
				testGame({
					tournamentMatchId: 2,
					mode: "RM" as ModeShort,
					stageId: 1 as StageId,
					playedAt: 2000,
				}),
			],
		});

		expect(matched.map(tournamentMatchIdOf)).toEqual([2]);
	});
});

describe("deriveScoreboardData", () => {
	function derive(
		linked: Array<{ data: ScannerMatch; povUserId: number | null }>,
	) {
		return Scoreboards.deriveScoreboardData({
			linked,
			winnerTeamId: WINNER_TEAM_ID,
			loserTeamId: LOSER_TEAM_ID,
		});
	}

	test("projects a match winner-first into scoreboard data", () => {
		const data = derive([{ data: testMatch(), povUserId: null }]);

		expect(data).toEqual({
			scores: [100, 52],
			players: NAMES.map((name, i) => ({
				name,
				tournamentTeamId: i < 4 ? WINNER_TEAM_ID : LOSER_TEAM_ID,
				weaponSplId: i < 4 ? 10 : 20,
				ka: 10,
				d: 5,
				s: 2,
				paint: 1000,
			})),
		});
	});

	test("a winner-1 match derives identically to its winner-0 mirror", () => {
		const straight = derive([{ data: testMatch(), povUserId: null }]);
		const swapped = derive([{ data: swapSides(testMatch()), povUserId: null }]);

		expect(swapped).toEqual(straight);
	});

	test("returns null for a match that cannot form a scoreboard", () => {
		expect(derive([])).toBe(null);
		expect(
			derive([{ data: { ...testMatch(), winner: null }, povUserId: null }]),
		).toBe(null);
	});

	test("rebases counter samples to the game's first read", () => {
		const data = derive([
			{ data: testMatch({ objective: testObjective() }), povUserId: null },
		]);

		expect(data!.objective).toEqual({
			mode: "SZ",
			samples: [
				{
					t: 0,
					time: 300,
					score: [100, 100],
					penalty: [null, null],
					control: [false, false],
				},
				{
					t: 30,
					time: 270,
					score: [80, 100],
					penalty: [null, 12],
					control: [true, false],
				},
			],
		});
	});

	test("derives counter samples winner-first", () => {
		const straight = derive([
			{ data: testMatch({ objective: testObjective() }), povUserId: null },
		]);
		const swapped = derive([
			{
				data: swapSides(testMatch({ objective: testObjective() })),
				povUserId: null,
			},
		]);

		expect(swapped!.objective).toEqual(straight!.objective);
	});

	test("rebases status samples onto the same origin as the counter's", () => {
		const data = derive([
			{
				data: testMatch({
					objective: testObjective(),
					playerStatus: testPlayerStatus(),
				}),
				povUserId: null,
			},
		]);

		// the status read at 595 came first, so it is the shared origin
		expect(data!.playerStatus!.samples[0]!.t).toBe(0);
		expect(data!.objective!.samples.map((sample) => sample.t)).toEqual([5, 35]);
	});

	test("derives status samples winner-first", () => {
		const straight = derive([
			{
				data: testMatch({ playerStatus: testPlayerStatus() }),
				povUserId: null,
			},
		]);
		const swapped = derive([
			{
				data: swapSides(testMatch({ playerStatus: testPlayerStatus() })),
				povUserId: null,
			},
		]);

		expect(straight!.playerStatus!.samples[0]!.dead).toEqual([
			[false, false, false, false],
			[false, true, false, false],
		]);
		expect(swapped!.playerStatus).toEqual(straight!.playerStatus);
	});

	test("leaves out the objective of a match with no counter reads", () => {
		const data = derive([{ data: testMatch(), povUserId: null }]);

		expect(data!.objective).toBeUndefined();
	});

	test("carries ingested player abilities through", () => {
		const build: AbilityWithUnknown[][] = [
			["ISM", "ISS", "ISS", "ISS"],
			["QR", "QSJ", "QSJ", "QSJ"],
			["SSU", "RSU", "RSU", "RSU"],
		];
		const data = derive([
			{ data: testMatch({ abilities: { 5: build } }), povUserId: null },
		]);

		expect(data!.players[5]!.abilities).toEqual(build);
		expect(data!.players[0]!.abilities).toBeUndefined();
	});

	test("keeps players with unread weapon or empty name", () => {
		const data = derive([
			{
				data: testMatch({
					names: ["w1", "", "w3", "w4", "l1", "l2", "l3", "l4"],
					weapons: [10, 10, null, 10, 20, 20, 20, 20],
				}),
				povUserId: null,
			},
		]);

		expect(data!.players).toHaveLength(8);
		expect(data!.players[1]!.name).toBe("");
		expect(data!.players[1]!.weaponSplId).toBe(10);
		expect(data!.players[2]!.weaponSplId).toBe(null);
		expect(data!.players[2]!.ka).toBe(10);
	});

	test("keeps players whose name appears twice on the same side", () => {
		const data = derive([
			{
				data: testMatch({
					names: ["dupe", "dupe", "w3", "w4", "l1", "l2", "l3", "dupe"],
				}),
				povUserId: null,
			},
		]);

		expect(data!.players.filter((p) => p.name === "dupe")).toHaveLength(3);
	});

	test("attributes the POV seat's row to the POV user", () => {
		const data = derive([{ data: testMatch({ povIndex: 2 }), povUserId: 42 }]);

		expect(data!.players[2]!.userId).toBe(42);
		expect(data!.players.filter((p) => p.userId !== undefined)).toHaveLength(1);
	});

	test("attributes a losing-side POV of a winner-1 match to the right row", () => {
		const data = derive([
			{ data: swapSides(testMatch({ povIndex: 6 })), povUserId: 42 },
		]);

		expect(data!.players[6]!.userId).toBe(42);
	});

	test("attributes each linked POV onto the merged scoreboard", () => {
		const data = derive([
			{ data: testMatch({ povIndex: 0 }), povUserId: 42 },
			{ data: swapSides(testMatch({ povIndex: 5 })), povUserId: 43 },
		]);

		expect(data!.players[0]!.userId).toBe(42);
		expect(data!.players[5]!.userId).toBe(43);
	});

	test("does not attribute the same row twice", () => {
		const data = derive([
			{ data: testMatch({ povIndex: 2 }), povUserId: 42 },
			{ data: testMatch({ povIndex: 2 }), povUserId: 43 },
		]);

		expect(data!.players[2]!.userId).toBe(42);
	});

	test("does not attribute a POV whose read name contradicts its seat's merged row", () => {
		const data = derive([
			{ data: testMatch(), povUserId: null },
			{
				data: testMatch({
					povIndex: 2,
					names: ["w1", "w2", "x9", "w4", "l1", "l2", "l3", "l4"],
				}),
				povUserId: 42,
			},
		]);

		expect(data!.players.some((p) => p.userId === 42)).toBe(false);
	});

	test("merges a later partial's fields under the first link's values", () => {
		const withoutScores: ScannerMatch = {
			...testMatch(),
			matchScores: null,
		};
		const data = derive([
			{ data: withoutScores, povUserId: null },
			{ data: testMatch(), povUserId: null },
		]);

		expect(data!.scores).toEqual([100, 52]);
	});
});

describe("winnerFirstPlayerNames", () => {
	test("returns names winner-first with unread names empty", () => {
		const names = Scoreboards.winnerFirstPlayerNames(
			swapSides(
				testMatch({ names: ["w1", "", "w3", "w4", "l1", "l2", "l3", "l4"] }),
			),
		);

		expect(names).toEqual(["w1", "", "w3", "w4", "l1", "l2", "l3", "l4"]);
	});

	test("returns null for a match without a linkable scoreboard", () => {
		expect(
			Scoreboards.winnerFirstPlayerNames({ ...testMatch(), winner: null }),
		).toBe(null);
	});
});

describe("resolveContext", () => {
	/** A tournament's reported games as an ordered (mode, stageId) sequence. */
	function tournamentGames(
		tournamentId: number,
		sequence: [ModeShort, number][],
		partial: Partial<Scoreboards.IngestableGame> = {},
	): Scoreboards.IngestableGameWithContext[] {
		return sequence.map(([mode, stageId], i) => ({
			...testGame({
				matchGameResultId: tournamentId * 1000 + i,
				tournamentMatchId: tournamentId * 100,
				mapIndex: i,
				mode,
				stageId: stageId as StageId,
				playedAt: 1000 + i,
				...partial,
			}),
			context: { type: "tournament", tournamentId },
		}));
	}

	/** A SendouQ match's reported games as an ordered (mode, stageId) sequence. */
	function sendouqGames(
		groupMatchId: number,
		sequence: [ModeShort, number][],
	): Scoreboards.IngestableGameWithContext[] {
		return sequence.map(([mode, stageId], i) => ({
			...testGame({
				mapIndex: i,
				mode,
				stageId: stageId as StageId,
				playedAt: 1000 + i,
			}),
			target: {
				type: "sendouq",
				groupMatchMapId: groupMatchId * 1000 + i,
				groupMatchId,
			},
			context: { type: "sendouq", groupMatchId },
		}));
	}

	const seenSequence = [
		testMatch({ t: 60, mode: "SZ", stage: 0 }),
		testMatch({ t: 600, mode: "TC", stage: 1 }),
	];

	test("resolves the tournament whose games match the seen sequence", () => {
		const context = Scoreboards.resolveContext({
			matches: seenSequence,
			games: [
				...tournamentGames(1, [
					["SZ", 0],
					["TC", 1],
				]),
				...tournamentGames(2, [
					["SZ", 3],
					["TC", 2],
				]),
			],
		});

		expect(context).toEqual({ type: "tournament", tournamentId: 1 });
	});

	test("resolves a SendouQ match over a tournament when its games match better", () => {
		const context = Scoreboards.resolveContext({
			matches: seenSequence,
			games: [
				...tournamentGames(1, [
					["SZ", 3],
					["TC", 2],
				]),
				...sendouqGames(7, [
					["SZ", 0],
					["TC", 1],
				]),
			],
		});

		expect(context).toEqual({ type: "sendouq", groupMatchId: 7 });
	});

	test("does not resolve from a single matching match", () => {
		const context = Scoreboards.resolveContext({
			matches: [seenSequence[0]!],
			games: tournamentGames(1, [
				["SZ", 0],
				["TC", 1],
			]),
		});

		expect(context).toBe(null);
	});

	test("lets roster sides break a map-sequence tie", () => {
		const sharedMaplist: [ModeShort, number][] = [
			["SZ", 0],
			["TC", 1],
		];
		const context = Scoreboards.resolveContext({
			matches: seenSequence,
			games: [
				...tournamentGames(1, sharedMaplist, {
					winnerInGameNames: ["w1", "w2", "w3", "w4"],
					loserInGameNames: ["l1", "l2", "l3", "l4"],
				}),
				// the other tournament's rosters contradict the match sides
				...tournamentGames(2, sharedMaplist, {
					winnerInGameNames: ["l1", "l2", "l3", "l4"],
					loserInGameNames: ["w1", "w2", "w3", "w4"],
				}),
			],
		});

		expect(context).toEqual({ type: "tournament", tournamentId: 1 });
	});

	test("skips unreadable matches but resolves from the rest", () => {
		const context = Scoreboards.resolveContext({
			matches: [
				seenSequence[0]!,
				testMatch({ t: 300, stage: null }),
				seenSequence[1]!,
			],
			games: [
				...tournamentGames(1, [
					["SZ", 0],
					["TC", 1],
				]),
				...tournamentGames(2, [
					["SZ", 3],
					["TC", 2],
				]),
			],
		});

		expect(context).toEqual({ type: "tournament", tournamentId: 1 });
	});
});
