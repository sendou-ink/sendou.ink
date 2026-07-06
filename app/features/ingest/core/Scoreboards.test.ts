import { describe, expect, it } from "vitest";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { IngestedEventInput } from "../ingest-schemas";
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
		...partial,
	};
}

function testScoreboard({
	t = 60,
	mode = "Splat Zones",
	stage = "Scorch Gorge",
	lobby = "Private Battle",
	names = ["w1", "w2", "w3", "w4", "l1", "l2", "l3", "l4"],
	weapons = ["10", "10", "10", "10", "20", "20", "20", "20"],
	povIndex = null,
}: {
	t?: number;
	mode?: string | null;
	stage?: string | null;
	lobby?: string | null;
	names?: string[];
	weapons?: string[];
	povIndex?: number | null;
} = {}): IngestedEventInput {
	return {
		type: "Scoreboard",
		t,
		confidence: 0.9,
		data: {
			lobby,
			mode,
			stage,
			scores: [100, 52],
			players: names.map((name, i) => ({
				name,
				weapon: weapons[i]!,
				paint: 1000,
				ka: 10,
				d: 5,
				s: 2,
			})),
			povIndex,
		},
	};
}

describe("matchedScoreboards", () => {
	it("turns a matching game's scoreboard into stored scoreboard data", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			events: [testScoreboard({ povIndex: 2 })],
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

	it("matches scoreboards to games by mode and stage", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			events: [
				testScoreboard({ mode: "Rainmaker", stage: "Eeltail Alley", t: 60 }),
			],
			games: [
				testGame({ mapIndex: 0, mode: "SZ", stageId: 0 as StageId }),
				testGame({ mapIndex: 1, mode: "RM", stageId: 1 as StageId }),
			],
		});

		expect(scoreboards.map((s) => s.mapIndex)).toEqual([1]);
	});

	it("assigns two games on the same mode and stage in chronological order", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			events: [
				testScoreboard({
					t: 60,
					names: ["a", "b", "c", "d", "e", "f", "g", "h"],
				}),
				testScoreboard({
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

	it("skips duplicate detections of the same scoreboard", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			events: [testScoreboard({ t: 60 }), testScoreboard({ t: 65 })],
			games: [
				testGame({ tournamentMatchId: 1, playedAt: 1000 }),
				testGame({ tournamentMatchId: 2, playedAt: 2000 }),
			],
		});

		expect(scoreboards).toHaveLength(1);
		expect(scoreboards[0]!.tournamentMatchId).toBe(1);
	});

	it("skips scoreboards from other lobbies", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			events: [testScoreboard({ lobby: "X Battle" })],
			games: [testGame()],
		});

		expect(scoreboards).toHaveLength(0);
	});

	it("skips scoreboards with unreadable mode or stage", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			events: [
				testScoreboard({ mode: null }),
				testScoreboard({ stage: "Not A Stage" }),
			],
			games: [testGame()],
		});

		expect(scoreboards).toHaveLength(0);
	});

	it("keeps players with unknown weapon or empty name", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			events: [
				testScoreboard({
					names: ["w1", "", "w3", "w4", "l1", "l2", "l3", "l4"],
					weapons: ["10", "10", "unknown", "10", "20", "20", "20", "20"],
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

	it("skips non-scoreboard events", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			events: [
				{
					type: "MapStart",
					t: 10,
					confidence: 0.9,
					data: { mode: "Splat Zones", stage: "Scorch Gorge" },
				},
			],
			games: [testGame()],
		});

		expect(scoreboards).toHaveLength(0);
	});

	it("skips scoreboards that have no matching game left", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			events: [
				testScoreboard({ t: 60 }),
				testScoreboard({
					t: 5000,
					names: ["i", "j", "k", "l", "m", "n", "o", "p"],
				}),
			],
			games: [testGame()],
		});

		expect(scoreboards).toHaveLength(1);
	});

	it("uses ScoreboardReplay events too", () => {
		const scoreboard = testScoreboard();
		const scoreboards = Scoreboards.matchedScoreboards({
			events: [
				{
					...scoreboard,
					type: "ScoreboardReplay",
					data: {
						...(scoreboard.data as Extract<
							IngestedEventInput,
							{ type: "Scoreboard" }
						>["data"]),
						timestamp: "3/7/2026 22:28",
						replayCode: "ABCD-EFGH-IJKL-MNOP",
						matchScores: [100, 52],
					},
				},
			],
			games: [testGame()],
		});

		expect(scoreboards).toHaveLength(1);
	});

	it("skips a game whose known rosters contradict the scoreboard sides", () => {
		const scoreboards = Scoreboards.matchedScoreboards({
			events: [testScoreboard()],
			games: [
				testGame({
					tournamentMatchId: 1,
					// scoreboard winners are w1-w4 but this game was won by the l* players
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
			events: [
				testScoreboard({
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
			events: [
				testScoreboard({
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
			events: [
				testScoreboard({ t: 60, mode: "Rainmaker", stage: "Eeltail Alley" }),
				testScoreboard({ t: 1000, mode: "Splat Zones", stage: "Scorch Gorge" }),
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
