import { describe, expect, it } from "vitest";
import type {
	ScannerMatch,
	ScannerMatchPlayer,
} from "~/features/scanner/core/scanner-match";
import type {
	ScannerAbility,
	ScannerLobby,
} from "~/features/scanner/scanner-types";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import * as Scoreboards from "./Scoreboards";

const WINNER_TEAM_ID = 100;
const LOSER_TEAM_ID = 200;

function testGame(
	partial: Partial<Scoreboards.IngestableGame> = {},
): Scoreboards.IngestableGame {
	return {
		matchGameResultId: 11,
		tournamentMatchId: 1,
		mapIndex: 0,
		mode: "SZ",
		stageId: 0 as StageId,
		winnerTeamId: WINNER_TEAM_ID,
		loserTeamId: LOSER_TEAM_ID,
		winnerInGameNames: [],
		loserInGameNames: [],
		playedAt: 1000,
		storedScoreboardPlayerNames: null,
		...partial,
	};
}

function testMatch({
	t = 60,
	mode = "SZ",
	stage = 0,
	lobby = "PRIVATE",
	names = ["w1", "w2", "w3", "w4", "l1", "l2", "l3", "l4"],
	weapons = [10, 10, 10, 10, 20, 20, 20, 20] as (MainWeaponId | null)[],
	abilities = {},
	povIndex = null,
}: {
	t?: number;
	mode?: ModeShort | null;
	stage?: StageId | null;
	lobby?: ScannerLobby | null;
	names?: string[];
	weapons?: (MainWeaponId | null)[];
	abilities?: Record<number, ScannerAbility[][]>;
	povIndex?: number | null;
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
		teams: [{ players: players.slice(0, 4) }, { players: players.slice(4) }],
		winner: 0,
		pov:
			povIndex === null
				? null
				: { team: povIndex < 4 ? 0 : 1, index: povIndex % 4 },
	};
}

/** The same game reported with sides in the other on-screen order. */
function swapSides(match: ScannerMatch): ScannerMatch {
	return {
		...match,
		teams: [match.teams[1], match.teams[0]],
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

describe("matchedScoreboards", () => {
	it("turns a matching game's match into stored scoreboard data", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			matches: [testMatch({ povIndex: 2 })],
			games: [testGame()],
		});

		expect(scoreboards).toHaveLength(1);
		expect(scoreboards[0]).toEqual({
			matchGameResultId: 11,
			tournamentMatchId: 1,
			mapIndex: 0,
			povIndex: 2,
			data: {
				scores: [100, 52],
				players: ["w1", "w2", "w3", "w4", "l1", "l2", "l3", "l4"].map(
					(name, i) => ({
						name,
						tournamentTeamId: i < 4 ? WINNER_TEAM_ID : LOSER_TEAM_ID,
						weaponSplId: i < 4 ? 10 : 20,
						ka: 10,
						d: 5,
						s: 2,
						paint: 1000,
					}),
				),
			},
		});
	});

	it("a winner-1 match stores identically to its winner-0 mirror", () => {
		const straight = Scoreboards.matchedScoreboards({
			matches: [testMatch({ povIndex: 6 })],
			games: [testGame()],
		});
		const swapped = Scoreboards.matchedScoreboards({
			matches: [swapSides(testMatch({ povIndex: 6 }))],
			games: [testGame()],
		});

		expect(swapped).toEqual(straight);
		expect(swapped[0]!.povIndex).toBe(6);
	});

	it("skips matches without a known winner", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			matches: [{ ...testMatch(), winner: null }],
			games: [testGame()],
		});

		expect(scoreboards).toHaveLength(0);
	});

	it("skips matches whose teams were not fully seen", () => {
		const partial = testMatch();
		partial.teams[1].players.pop();
		const scoreboards = Scoreboards.matchedScoreboards({
			matches: [partial],
			games: [testGame()],
		});

		expect(scoreboards).toHaveLength(0);
	});

	it("carries ingested player abilities through to the stored scoreboard", () => {
		const build: ScannerAbility[][] = [
			["ISM", "ISS", "ISS", "ISS"],
			["QR", "QSJ", "QSJ", "QSJ"],
			["SSU", "RSU", "RSU", "RSU"],
		];
		const scoreboards = Scoreboards.matchedScoreboards({
			matches: [testMatch({ abilities: { 5: build } })],
			games: [testGame()],
		});

		expect(scoreboards[0]!.data.players[5]!.abilities).toEqual(build);
		expect(scoreboards[0]!.data.players[0]!.abilities).toBeUndefined();
	});

	it("skips a game whose stored scoreboard has different players", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			matches: [testMatch()],
			games: [
				testGame({
					matchGameResultId: 11,
					storedScoreboardPlayerNames: ["a", "b", "c", "d", "e", "f", "g", "h"],
				}),
				testGame({ matchGameResultId: 12, playedAt: 2000 }),
			],
		});

		expect(scoreboards.map((s) => s.matchGameResultId)).toEqual([12]);
	});

	it("matches a re-detection of a stored scoreboard to the same game despite misread names", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			matches: [testMatch()],
			games: [
				testGame({
					matchGameResultId: 11,
					storedScoreboardPlayerNames: [
						"w1",
						"w2",
						"w3",
						"wA",
						"l1",
						"l2",
						"l3",
						"lB",
					],
				}),
				testGame({ matchGameResultId: 12, playedAt: 2000 }),
			],
		});

		expect(scoreboards.map((s) => s.matchGameResultId)).toEqual([11]);
	});

	it("does not count unreadable names towards stored scoreboard re-detection", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			matches: [testMatch({ names: ["", "", "", "", "l1", "l2", "l3", "l4"] })],
			games: [
				testGame({
					matchGameResultId: 11,
					storedScoreboardPlayerNames: ["", "", "", "", "l1", "l2", "l3", "l4"],
				}),
				testGame({ matchGameResultId: 12, playedAt: 2000 }),
			],
		});

		expect(scoreboards.map((s) => s.matchGameResultId)).toEqual([12]);
	});

	it("matches matches to games by mode and stage", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			matches: [testMatch({ mode: "RM", stage: 1, t: 60 })],
			games: [
				testGame({ mapIndex: 0, mode: "SZ", stageId: 0 as StageId }),
				testGame({ mapIndex: 1, mode: "RM", stageId: 1 as StageId }),
			],
		});

		expect(scoreboards.map((s) => s.mapIndex)).toEqual([1]);
	});

	it("assigns two games on the same mode and stage in chronological order", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
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

		expect(
			scoreboards.find((s) => s.data.players[0]!.name === "a")
				?.tournamentMatchId,
		).toBe(1);
		expect(
			scoreboards.find((s) => s.data.players[0]!.name === "i")
				?.tournamentMatchId,
		).toBe(2);
	});

	it("skips duplicate detections of the same game", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			matches: [testMatch({ t: 60 }), testMatch({ t: 65 })],
			games: [
				testGame({ tournamentMatchId: 1, playedAt: 1000 }),
				testGame({ tournamentMatchId: 2, playedAt: 2000 }),
			],
		});

		expect(scoreboards).toHaveLength(1);
		expect(scoreboards[0]!.tournamentMatchId).toBe(1);
	});

	it("skips matches from other lobbies", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			matches: [testMatch({ lobby: "X" })],
			games: [testGame()],
		});

		expect(scoreboards).toHaveLength(0);
	});

	it("skips matches with unreadable mode or stage", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			matches: [testMatch({ mode: null }), testMatch({ stage: null })],
			games: [testGame()],
		});

		expect(scoreboards).toHaveLength(0);
	});

	it("keeps players with unread weapon or empty name", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			matches: [
				testMatch({
					names: ["w1", "", "w3", "w4", "l1", "l2", "l3", "l4"],
					weapons: [10, 10, null, 10, 20, 20, 20, 20],
				}),
			],
			games: [testGame()],
		});

		const players = scoreboards[0]!.data.players;
		expect(players).toHaveLength(8);
		expect(players[1]!.name).toBe("");
		expect(players[1]!.weaponSplId).toBe(10);
		expect(players[2]!.weaponSplId).toBe(null);
		expect(players[2]!.ka).toBe(10);
	});

	it("skips matches that have no matching game left", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			matches: [
				testMatch({ t: 60 }),
				testMatch({
					t: 5000,
					names: ["i", "j", "k", "l", "m", "n", "o", "p"],
				}),
			],
			games: [testGame()],
		});

		expect(scoreboards).toHaveLength(1);
	});

	it("skips a game whose known rosters contradict the match sides", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
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

		expect(scoreboards.map((s) => s.tournamentMatchId)).toEqual([2]);
	});

	it("matches known in-game names ignoring discriminator, case and unicode width", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
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
		expect(scoreboards).toHaveLength(1);
	});

	it("keeps players whose name appears twice on the same side", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			matches: [
				testMatch({
					names: ["dupe", "dupe", "w3", "w4", "l1", "l2", "l3", "dupe"],
				}),
			],
			games: [testGame()],
		});

		expect(
			scoreboards[0]!.data.players.filter((p) => p.name === "dupe"),
		).toHaveLength(3);
	});

	it("does not assign a game played before the previously assigned one", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
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

		expect(scoreboards.map((s) => s.tournamentMatchId)).toEqual([2]);
	});
});

describe("resolveTournamentId", () => {
	/** A tournament's reported games as an ordered (mode, stageId) sequence. */
	function tournamentGames(
		tournamentId: number,
		sequence: [ModeShort, number][],
		partial: Partial<Scoreboards.IngestableGame> = {},
	): Scoreboards.IngestableGameWithTournament[] {
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
			tournamentId,
		}));
	}

	const seenSequence = [
		testMatch({ t: 60, mode: "SZ", stage: 0 }),
		testMatch({ t: 600, mode: "TC", stage: 1 }),
	];

	it("resolves the tournament whose games match the seen sequence", () => {
		const tournamentId = Scoreboards.resolveTournamentId({
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

		expect(tournamentId).toBe(1);
	});

	it("does not resolve from a single matching match", () => {
		const tournamentId = Scoreboards.resolveTournamentId({
			matches: [seenSequence[0]!],
			games: tournamentGames(1, [
				["SZ", 0],
				["TC", 1],
			]),
		});

		expect(tournamentId).toBe(null);
	});

	it("lets roster sides break a map-sequence tie", () => {
		const sharedMaplist: [ModeShort, number][] = [
			["SZ", 0],
			["TC", 1],
		];
		const tournamentId = Scoreboards.resolveTournamentId({
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

		expect(tournamentId).toBe(1);
	});

	it("skips unreadable matches but resolves from the rest", () => {
		const tournamentId = Scoreboards.resolveTournamentId({
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

		expect(tournamentId).toBe(1);
	});
});
