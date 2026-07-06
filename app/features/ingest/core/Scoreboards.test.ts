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
}: {
	t?: number;
	mode?: string | null;
	stage?: string | null;
	lobby?: string | null;
	names?: string[];
	weapons?: string[];
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
		},
	};
}

describe("reportedWeaponRowsFromEvents", () => {
	it("fills weapons for all 8 players of a matching game", () => {
		const rows = Scoreboards.reportedWeaponRowsFromEvents({
			events: [testScoreboard()],
			games: [testGame()],
			createdAt: 123,
		});

		expect(rows).toHaveLength(8);
		expect(rows[0]).toEqual({
			tournamentMatchId: 1,
			mapIndex: 0,
			weaponSplId: 10,
			ingestedInGameName: "w1",
			ingestedTeamId: WINNER_TEAM_ID,
			createdAt: 123,
		});
	});

	it("assigns the winning side to the game's winner team and the losing side to the loser team", () => {
		const rows = Scoreboards.reportedWeaponRowsFromEvents({
			events: [testScoreboard()],
			games: [testGame()],
			createdAt: 123,
		});

		expect(
			rows
				.filter((row) => row.ingestedTeamId === WINNER_TEAM_ID)
				.map((row) => row.ingestedInGameName),
		).toEqual(["w1", "w2", "w3", "w4"]);
		expect(
			rows
				.filter((row) => row.ingestedTeamId === LOSER_TEAM_ID)
				.map((row) => row.ingestedInGameName),
		).toEqual(["l1", "l2", "l3", "l4"]);
	});

	it("matches scoreboards to games by mode and stage", () => {
		const rows = Scoreboards.reportedWeaponRowsFromEvents({
			events: [
				testScoreboard({ mode: "Rainmaker", stage: "Eeltail Alley", t: 60 }),
			],
			games: [
				testGame({ mapIndex: 0, mode: "SZ", stageId: 0 as StageId }),
				testGame({ mapIndex: 1, mode: "RM", stageId: 1 as StageId }),
			],
			createdAt: 123,
		});

		expect(new Set(rows.map((row) => row.mapIndex))).toEqual(new Set([1]));
	});

	it("assigns two games on the same mode and stage in chronological order", () => {
		const rows = Scoreboards.reportedWeaponRowsFromEvents({
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
			createdAt: 123,
		});

		expect(
			rows.find((row) => row.ingestedInGameName === "a")?.tournamentMatchId,
		).toBe(1);
		expect(
			rows.find((row) => row.ingestedInGameName === "i")?.tournamentMatchId,
		).toBe(2);
	});

	it("skips duplicate detections of the same scoreboard", () => {
		const rows = Scoreboards.reportedWeaponRowsFromEvents({
			events: [testScoreboard({ t: 60 }), testScoreboard({ t: 65 })],
			games: [
				testGame({ tournamentMatchId: 1, playedAt: 1000 }),
				testGame({ tournamentMatchId: 2, playedAt: 2000 }),
			],
			createdAt: 123,
		});

		expect(rows).toHaveLength(8);
		expect(rows[0]!.tournamentMatchId).toBe(1);
	});

	it("skips scoreboards from other lobbies", () => {
		const rows = Scoreboards.reportedWeaponRowsFromEvents({
			events: [testScoreboard({ lobby: "X Battle" })],
			games: [testGame()],
			createdAt: 123,
		});

		expect(rows).toHaveLength(0);
	});

	it("skips scoreboards with unreadable mode or stage", () => {
		const rows = Scoreboards.reportedWeaponRowsFromEvents({
			events: [
				testScoreboard({ mode: null }),
				testScoreboard({ stage: "Not A Stage" }),
			],
			games: [testGame()],
			createdAt: 123,
		});

		expect(rows).toHaveLength(0);
	});

	it("skips players with unknown weapon or empty name", () => {
		const rows = Scoreboards.reportedWeaponRowsFromEvents({
			events: [
				testScoreboard({
					names: ["w1", "", "w3", "w4", "l1", "l2", "l3", "l4"],
					weapons: ["10", "10", "unknown", "10", "20", "20", "20", "20"],
				}),
			],
			games: [testGame()],
			createdAt: 123,
		});

		expect(rows).toHaveLength(6);
		expect(rows.some((row) => row.ingestedInGameName === "w3")).toBe(false);
	});

	it("skips non-scoreboard events", () => {
		const rows = Scoreboards.reportedWeaponRowsFromEvents({
			events: [
				{
					type: "MapStart",
					t: 10,
					confidence: 0.9,
					data: { mode: "Splat Zones", stage: "Scorch Gorge" },
				},
			],
			games: [testGame()],
			createdAt: 123,
		});

		expect(rows).toHaveLength(0);
	});

	it("skips scoreboards that have no matching game left", () => {
		const rows = Scoreboards.reportedWeaponRowsFromEvents({
			events: [
				testScoreboard({ t: 60 }),
				testScoreboard({
					t: 5000,
					names: ["i", "j", "k", "l", "m", "n", "o", "p"],
				}),
			],
			games: [testGame()],
			createdAt: 123,
		});

		expect(rows).toHaveLength(8);
	});

	it("uses ScoreboardReplay events too", () => {
		const scoreboard = testScoreboard();
		const rows = Scoreboards.reportedWeaponRowsFromEvents({
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
			createdAt: 123,
		});

		expect(rows).toHaveLength(8);
	});

	it("skips a game whose known rosters contradict the scoreboard sides", () => {
		const rows = Scoreboards.reportedWeaponRowsFromEvents({
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
			createdAt: 123,
		});

		expect(rows.map((row) => row.tournamentMatchId)).not.toContain(1);
		expect(rows.filter((row) => row.tournamentMatchId === 2)).toHaveLength(8);
	});

	it("matches known in-game names ignoring discriminator, case and unicode width", () => {
		const rows = Scoreboards.reportedWeaponRowsFromEvents({
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
			createdAt: 123,
		});

		// "Ｗ１" matches winner roster "w1#1234" straight (1) but "w3" on the
		// winning side would match the loser roster flipped (1); straight wins ties
		expect(rows).toHaveLength(8);
	});

	it("skips players whose name appears twice on the same side", () => {
		const rows = Scoreboards.reportedWeaponRowsFromEvents({
			events: [
				testScoreboard({
					names: ["dupe", "dupe", "w3", "w4", "l1", "l2", "l3", "dupe"],
				}),
			],
			games: [testGame()],
			createdAt: 123,
		});

		expect(
			rows.filter((row) => row.ingestedInGameName === "dupe"),
		).toHaveLength(1);
		expect(
			rows.find((row) => row.ingestedInGameName === "dupe")?.ingestedTeamId,
		).toBe(LOSER_TEAM_ID);
		expect(rows).toHaveLength(6);
	});

	it("does not assign a game played before the previously assigned one", () => {
		const rows = Scoreboards.reportedWeaponRowsFromEvents({
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
			createdAt: 123,
		});

		expect(rows.map((row) => row.tournamentMatchId)).not.toContain(1);
		expect(rows.filter((row) => row.tournamentMatchId === 2)).toHaveLength(8);
	});
});
