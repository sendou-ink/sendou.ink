import { describe, expect, test } from "vitest";
import type { TournamentStageSettings } from "~/db/tables-json";
import { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	LOW_INK_AUGUST_2025,
	LOW_INK_AUGUST_2026_ROUND_3,
	RUSH_WEEKEND_3,
} from "~/features/tournament-bracket/core/tests/mocks-swiss";
import { ZONES_WEEKLY_38 } from "~/features/tournament-bracket/core/tests/mocks-zones-weekly";
import invariant from "~/utils/invariant";
import { unwrap } from "~/utils/result";
import * as Engine from "./engine";
import { pairUp } from "./engine/swiss/pairing";
import * as TeamStatus from "./engine/swiss/team-status";

const Swiss = {
	...TeamStatus,
	pairUp,
	create: (args: { seeding: number[]; settings?: TournamentStageSettings }) =>
		Engine.create({
			...args,
			type: "swiss",
			settings: args.settings ?? null,
		}),
};

describe("Swiss", () => {
	const createArgsWithDefaults = (
		args: Partial<Parameters<typeof Swiss.create>[0]> = {},
	): Parameters<typeof Swiss.create>[0] => {
		return {
			seeding: [1, 2, 3, 4],
			settings: {},
			...args,
		};
	};

	describe("create()", () => {
		test("creates a swiss bracket with correct amount of initial matches", () => {
			const data = Swiss.create(createArgsWithDefaults());

			expect(data.match).toHaveLength(2);
		});

		test("creates a swiss bracket with correct amount of rounds as default", () => {
			const data = Swiss.create(createArgsWithDefaults());

			expect(data.round).toHaveLength(5);
		});

		test("creates a swiss bracket with correct amount of rounds as parameter", () => {
			const data = Swiss.create(
				createArgsWithDefaults({
					settings: {
						groupCount: 1,
						roundCount: 4,
					},
				}),
			);

			expect(data.round).toHaveLength(4);
		});

		test("creates a swiss bracket with two groups", () => {
			const data = Swiss.create(
				createArgsWithDefaults({
					settings: {
						groupCount: 2,
						roundCount: 5,
					},
				}),
			);

			expect(data.round).toHaveLength(10);

			const matchGroupIds = data.match.map((m) => m.groupId);
			expect(matchGroupIds).toContain(0);
			expect(matchGroupIds).toContain(1);
		});

		test("every team has a match", () => {
			const data = Swiss.create(createArgsWithDefaults());

			for (const teamId of [1, 2, 3, 4]) {
				expect(
					data.match.some(
						(match) =>
							match.opponent1?.id === teamId || match.opponent2?.id === teamId,
					),
				).toBe(true);
			}
		});

		test("assigns a BYE if odd number of teams", () => {
			const data = Swiss.create(
				createArgsWithDefaults({
					seeding: [1, 2, 3, 4, 5],
				}),
			);

			const byes = data.match.filter((match) => match.opponent2 === null);
			expect(byes).toHaveLength(1);
		});

		test("if no teams, should generate a bracket data with no matches", () => {
			const data = Swiss.create(createArgsWithDefaults({ seeding: [] }));

			expect(data.match).toHaveLength(0);
		});
	});

	describe("generateMatchUps()", () => {
		describe("Zones Weekly 38", () => {
			const tournament = new Tournament({
				...ZONES_WEEKLY_38(),
			});

			const bracket = tournament.bracketByIdx(0)!;

			const matches = unwrap(
				Engine.generateRound(bracket.data as Engine.BracketData, {
					groupId: 4443,
					standings: bracket.standings,
					settings: bracket.settings,
				}),
			).matches;

			test("finds new opponents for each team in the last round", () => {
				for (const match of matches) {
					if (match.opponent2 === null) continue;

					const opponent1 = match.opponent1!.id as number;
					const opponent2 = match.opponent2.id as number;

					const existingMatch = bracket.data.match.find(
						(m) =>
							(m.opponent1?.id === opponent1 &&
								m.opponent2?.id === opponent2) ||
							(m.opponent1?.id === opponent2 && m.opponent2?.id === opponent1),
					);

					expect(existingMatch).toBeUndefined();
				}
			});

			test("generates a bye", () => {
				const byes = matches.filter((match) => match.opponent2 === null);
				expect(byes).toHaveLength(1);
			});

			test("every pair is max one set win from each other", () => {
				for (const match of matches) {
					if (match.opponent2 === null) continue;

					const opponent1 = match.opponent1!.id as number;
					const opponent2 = match.opponent2.id as number;

					const opponent1Stats = bracket.standings.find(
						(s) => s.team.id === opponent1,
					)?.stats;
					const opponent2Stats = bracket.standings.find(
						(s) => s.team.id === opponent2,
					)?.stats;

					invariant(opponent1Stats, "Opponent 1 not found in standings");
					invariant(opponent2Stats, "Opponent 2 not found in standings");

					expect(
						Math.abs(opponent1Stats.setWins - opponent2Stats.setWins),
					).toBeLessThanOrEqual(1);
				}
			});
		});
	});

	describe("generateRound() with early advance", () => {
		const EARLY_ADVANCE_SETTINGS = { advanceThreshold: 2 };

		// 4 rounds & advance threshold of 2 means teams advance at 2 wins and are eliminated at 3 losses
		const bracketWithFinishedRound = () => {
			const data = Swiss.create({
				seeding: [1, 2, 3, 4],
				settings: { groupCount: 1, roundCount: 4 },
			});

			for (const match of data.match) {
				match.winnerSide = "opponent1";
			}

			return data;
		};

		const standingsOf = (
			records: Array<{ id: number; setWins: number; setLosses: number }>,
		) =>
			records.map((record) => ({
				team: { id: record.id },
				stats: { setWins: record.setWins, setLosses: record.setLosses },
			}));

		test("gives a bye to the only team left in the running", () => {
			const round = unwrap(
				Engine.generateRound(bracketWithFinishedRound(), {
					groupId: 0,
					standings: standingsOf([
						{ id: 1, setWins: 2, setLosses: 0 }, // advanced
						{ id: 2, setWins: 0, setLosses: 3 }, // eliminated
						{ id: 3, setWins: 0, setLosses: 3 }, // eliminated
						{ id: 4, setWins: 1, setLosses: 1 },
					]),
					settings: EARLY_ADVANCE_SETTINGS,
				}),
			);

			expect(round.matches).toEqual([
				{ number: 1, opponent1: { id: 4 }, opponent2: null },
			]);
		});

		test("generates no round if no team is left in the running", () => {
			const round = Engine.generateRound(bracketWithFinishedRound(), {
				groupId: 0,
				standings: standingsOf([
					{ id: 1, setWins: 2, setLosses: 0 },
					{ id: 2, setWins: 2, setLosses: 1 },
					{ id: 3, setWins: 0, setLosses: 3 },
					{ id: 4, setWins: 1, setLosses: 3 },
				]),
				settings: EARLY_ADVANCE_SETTINGS,
			});

			expect(round.ok).toBe(false);
		});
	});

	const PAIR_UP_TEST_CASES = [
		RUSH_WEEKEND_3,
		LOW_INK_AUGUST_2025,
		LOW_INK_AUGUST_2026_ROUND_3,
	];

	describe("pairUp()", () => {
		test.for(PAIR_UP_TEST_CASES)(
			"all teams have matches (pair up test cases idx %#)",
			(testCase) => {
				const result = Swiss.pairUp(testCase);

				const inputTeams = testCase
					.map((team) => team.id)
					.sort((a, b) => a - b);
				const resultTeams = result
					.flatMap((match) => [match.opponentOne, match.opponentTwo])
					.filter((val) => val !== null)
					.sort((a, b) => a - b);

				expect(inputTeams).toEqual(resultTeams);
			},
		);

		test.for(PAIR_UP_TEST_CASES)(
			"every pair is max one set win from each other (pair up test cases idx %#)",
			(testCase) => {
				const result = Swiss.pairUp(testCase);

				for (const match of result) {
					if (match.opponentOne === null || match.opponentTwo === null)
						continue;

					const opponentOneScore = testCase.find(
						(t) => t.id === match.opponentOne,
					)!.score;
					const opponentTwoScore = testCase.find(
						(t) => t.id === match.opponentTwo,
					)!.score;

					expect(
						Math.abs(opponentOneScore - opponentTwoScore),
						`Teams ${match.opponentOne} and ${match.opponentTwo} have too large score difference (${opponentOneScore} vs ${opponentTwoScore})`,
					).toBeLessThanOrEqual(1);
				}
			},
		);

		test.for(PAIR_UP_TEST_CASES)(
			"matches perfect records against each other as much as possible (pair up test cases idx %#)",
			(testCase) => {
				const result = Swiss.pairUp(testCase);

				const maxScore = testCase.reduce(
					(max, team) => Math.max(max, team.score),
					0,
				);
				const perfectRecordsCount = testCase.filter(
					(team) => team.score === maxScore,
				).length;

				let perfectRecordsPlayingEachOtherCount = 0;

				for (const match of result) {
					if (match.opponentOne === null || match.opponentTwo === null)
						continue;

					const oneIsPerfectScore = testCase.some(
						(team) => team.id === match.opponentOne && team.score === maxScore,
					);
					const twoIsPerfectScore = testCase.some(
						(team) => team.id === match.opponentTwo && team.score === maxScore,
					);

					if (oneIsPerfectScore && twoIsPerfectScore) {
						perfectRecordsPlayingEachOtherCount++;
					}
				}

				expect(perfectRecordsPlayingEachOtherCount).toBe(
					Math.floor(perfectRecordsCount / 2),
				);
			},
		);

		test.for(PAIR_UP_TEST_CASES)(
			"generates max one bye (pair up test cases idx %#)",
			(testCase) => {
				const result = Swiss.pairUp(testCase);

				let byes = 0;
				for (const match of result) {
					if (match.opponentOne === null || match.opponentTwo === null) byes++;
				}

				expect(byes).toBeLessThanOrEqual(1);
			},
		);

		test("gives a bye to a lone team", () => {
			expect(Swiss.pairUp([{ id: 1, score: 2, avoid: [] }])).toEqual([
				{ opponentOne: 1, opponentTwo: null },
			]);
		});

		test("replays if a rematch free pairing does not exist for every team", () => {
			// only 1 & 2 have not played each other yet
			const result = Swiss.pairUp([
				{ id: 1, score: 1, avoid: [3, 4] },
				{ id: 2, score: 1, avoid: [3, 4] },
				{ id: 3, score: 1, avoid: [1, 2, 4] },
				{ id: 4, score: 1, avoid: [1, 2, 3] },
			]);

			expect(result).toHaveLength(2);
			expect(includesPair(result, 1, 2)).toBe(true);
			expect(includesPair(result, 3, 4)).toBe(true);
		});

		test("prefers replaying teams that have met the fewest times", () => {
			// everyone has played everyone, but 1 & 2 have already played twice
			const result = Swiss.pairUp([
				{ id: 1, score: 1, avoid: [2, 2, 3, 4] },
				{ id: 2, score: 1, avoid: [1, 1, 3, 4] },
				{ id: 3, score: 1, avoid: [1, 2, 4] },
				{ id: 4, score: 1, avoid: [1, 2, 3] },
			]);

			expect(includesPair(result, 1, 2)).toBe(false);
		});

		test("prefers giving the bye to the lowest standing team without a previous bye", () => {
			// five team swiss entering round 4: teams 3, 4 and 5 have already had a
			// bye, team 3 in the round right before this one. Teams 1 and 2 have not,
			// and a rematch free pairing where team 2 (the lowest standing team
			// without a previous bye) gets the bye exists: 1-4, 3-5
			const result = Swiss.pairUp([
				{ id: 1, score: 3, avoid: [3, 5, 2] },
				{ id: 2, score: 2, avoid: [4, 3, 1] },
				{ id: 4, score: 2, avoid: [2, 5], receivedBye: true },
				{ id: 3, score: 1, avoid: [1, 2], receivedBye: true },
				{ id: 5, score: 1, avoid: [1, 4], receivedBye: true },
			]);

			const bye = result.find((match) => match.opponentTwo === null);

			expect(bye?.opponentOne).toBe(2);
		});

		test("gives the bye to the lowest score group even when byeing a top group team would keep every pairing within its score group", () => {
			// real state where the top score group had an odd size (7) while the
			// lower groups were even (16 and 6): byeing an undefeated team lets
			// every match stay within its score group, which the weights preferred:
			// live this gave the free win to the 2-0 top seed instead of a 0-2 team
			const result = Swiss.pairUp(LOW_INK_AUGUST_2026_ROUND_3);

			const bye = result.find((match) => match.opponentTwo === null);
			invariant(bye, "bye not found");

			const byeTeam = LOW_INK_AUGUST_2026_ROUND_3.find(
				(team) => team.id === bye.opponentOne,
			);

			expect(byeTeam?.score).toBe(0);
		});
	});

	describe("calculateTeamStatus()", () => {
		test("returns 'advanced' when team has enough wins", () => {
			expect(
				Swiss.calculateTeamStatus({
					wins: 3,
					losses: 0,
					advanceThreshold: 3,
					roundCount: 5,
				}),
			).toBe("advanced");
			expect(
				Swiss.calculateTeamStatus({
					wins: 3,
					losses: 1,
					advanceThreshold: 3,
					roundCount: 5,
				}),
			).toBe("advanced");
			expect(
				Swiss.calculateTeamStatus({
					wins: 4,
					losses: 1,
					advanceThreshold: 3,
					roundCount: 5,
				}),
			).toBe("advanced");
		});

		test("returns 'eliminated' when team has too many losses", () => {
			expect(
				Swiss.calculateTeamStatus({
					wins: 0,
					losses: 3,
					advanceThreshold: 3,
					roundCount: 5,
				}),
			).toBe("eliminated");
			expect(
				Swiss.calculateTeamStatus({
					wins: 1,
					losses: 3,
					advanceThreshold: 3,
					roundCount: 5,
				}),
			).toBe("eliminated");
			expect(
				Swiss.calculateTeamStatus({
					wins: 2,
					losses: 3,
					advanceThreshold: 3,
					roundCount: 5,
				}),
			).toBe("eliminated");
		});

		test("returns 'active' when team can still advance or be eliminated", () => {
			expect(
				Swiss.calculateTeamStatus({
					wins: 2,
					losses: 2,
					advanceThreshold: 3,
					roundCount: 5,
				}),
			).toBe("active");
			expect(
				Swiss.calculateTeamStatus({
					wins: 1,
					losses: 1,
					advanceThreshold: 3,
					roundCount: 5,
				}),
			).toBe("active");
			expect(
				Swiss.calculateTeamStatus({
					wins: 0,
					losses: 0,
					advanceThreshold: 3,
					roundCount: 5,
				}),
			).toBe("active");
			expect(
				Swiss.calculateTeamStatus({
					wins: 2,
					losses: 1,
					advanceThreshold: 3,
					roundCount: 5,
				}),
			).toBe("active");
		});

		test("handles different tournament configurations", () => {
			// 4-round tournament with advance threshold 2
			expect(
				Swiss.calculateTeamStatus({
					wins: 2,
					losses: 0,
					advanceThreshold: 2,
					roundCount: 4,
				}),
			).toBe("advanced");
			expect(
				Swiss.calculateTeamStatus({
					wins: 0,
					losses: 3,
					advanceThreshold: 2,
					roundCount: 4,
				}),
			).toBe("eliminated");
			expect(
				Swiss.calculateTeamStatus({
					wins: 1,
					losses: 2,
					advanceThreshold: 2,
					roundCount: 4,
				}),
			).toBe("active");

			// 6-round tournament with advance threshold 4
			expect(
				Swiss.calculateTeamStatus({
					wins: 4,
					losses: 1,
					advanceThreshold: 4,
					roundCount: 6,
				}),
			).toBe("advanced");
			expect(
				Swiss.calculateTeamStatus({
					wins: 2,
					losses: 3,
					advanceThreshold: 4,
					roundCount: 6,
				}),
			).toBe("eliminated");
			expect(
				Swiss.calculateTeamStatus({
					wins: 3,
					losses: 2,
					advanceThreshold: 4,
					roundCount: 6,
				}),
			).toBe("active");
		});

		test("handles edge cases correctly", () => {
			// Team reaches advance threshold exactly
			expect(
				Swiss.calculateTeamStatus({
					wins: 3,
					losses: 2,
					advanceThreshold: 3,
					roundCount: 5,
				}),
			).toBe("advanced");

			// Team reaches elimination threshold exactly
			expect(
				Swiss.calculateTeamStatus({
					wins: 2,
					losses: 3,
					advanceThreshold: 3,
					roundCount: 5,
				}),
			).toBe("eliminated");

			// Tournament where advance threshold equals round count
			expect(
				Swiss.calculateTeamStatus({
					wins: 3,
					losses: 0,
					advanceThreshold: 3,
					roundCount: 3,
				}),
			).toBe("advanced");
			expect(
				Swiss.calculateTeamStatus({
					wins: 0,
					losses: 3,
					advanceThreshold: 3,
					roundCount: 3,
				}),
			).toBe("eliminated");
		});
	});

	describe("Threshold validation utilities", () => {
		describe("maxAdvanceThreshold()", () => {
			test("calculates maximum advance threshold correctly", () => {
				expect(Swiss.maxAdvanceThreshold({ roundCount: 3 })).toBe(3); // ceil(3/2) + 1 = 2 + 1 = 3
				expect(Swiss.maxAdvanceThreshold({ roundCount: 4 })).toBe(3); // ceil(4/2) + 1 = 2 + 1 = 3
				expect(Swiss.maxAdvanceThreshold({ roundCount: 5 })).toBe(4); // ceil(5/2) + 1 = 3 + 1 = 4
				expect(Swiss.maxAdvanceThreshold({ roundCount: 6 })).toBe(4); // ceil(6/2) + 1 = 3 + 1 = 4
				expect(Swiss.maxAdvanceThreshold({ roundCount: 7 })).toBe(5); // ceil(7/2) + 1 = 4 + 1 = 5
			});
		});

		describe("isValidAdvanceThreshold()", () => {
			test("validates correct thresholds", () => {
				expect(
					Swiss.isValidAdvanceThreshold({ roundCount: 5, advanceThreshold: 3 }),
				).toBe(true);
				expect(
					Swiss.isValidAdvanceThreshold({ roundCount: 4, advanceThreshold: 2 }),
				).toBe(true);
				expect(
					Swiss.isValidAdvanceThreshold({ roundCount: 6, advanceThreshold: 4 }),
				).toBe(true);
				expect(
					Swiss.isValidAdvanceThreshold({ roundCount: 3, advanceThreshold: 2 }),
				).toBe(true);
			});

			test("rejects invalid thresholds", () => {
				// Threshold too high
				expect(
					Swiss.isValidAdvanceThreshold({ roundCount: 5, advanceThreshold: 5 }),
				).toBe(false); // equals round count
				expect(
					Swiss.isValidAdvanceThreshold({ roundCount: 5, advanceThreshold: 6 }),
				).toBe(false); // exceeds round count

				// Threshold too low
				expect(
					Swiss.isValidAdvanceThreshold({ roundCount: 5, advanceThreshold: 0 }),
				).toBe(false);
				expect(
					Swiss.isValidAdvanceThreshold({
						roundCount: 3,
						advanceThreshold: -1,
					}),
				).toBe(false);
			});

			test("handles edge cases", () => {
				expect(
					Swiss.isValidAdvanceThreshold({ roundCount: 3, advanceThreshold: 2 }),
				).toBe(true); // minimum valid
				expect(
					Swiss.isValidAdvanceThreshold({ roundCount: 5, advanceThreshold: 4 }),
				).toBe(true); // maximum valid for 5 rounds
			});
		});

		describe("validAdvanceThresholdOptions()", () => {
			test("returns correct options for different round counts", () => {
				expect(Swiss.validAdvanceThresholdOptions({ roundCount: 3 })).toEqual([
					2, 3,
				]);
				expect(Swiss.validAdvanceThresholdOptions({ roundCount: 5 })).toEqual([
					2, 3, 4,
				]);
				expect(Swiss.validAdvanceThresholdOptions({ roundCount: 8 })).toEqual([
					2, 3, 4, 5,
				]);
			});

			test("handles minimal round counts", () => {
				expect(Swiss.validAdvanceThresholdOptions({ roundCount: 2 })).toEqual([
					2,
				]);
				expect(Swiss.validAdvanceThresholdOptions({ roundCount: 1 })).toEqual([
					2,
				]);
			});

			test("includes thresholds up to the calculated maximum for large round counts", () => {
				const roundCount = 9;
				const max = Swiss.maxAdvanceThreshold({ roundCount });

				expect(Swiss.validAdvanceThresholdOptions({ roundCount })).toContain(
					max,
				);
				expect(
					Swiss.isValidAdvanceThreshold({ roundCount, advanceThreshold: max }),
				).toBe(true);
			});
		});
	});
});

function includesPair(
	result: Array<{ opponentOne: number; opponentTwo: number | null }>,
	one: number,
	two: number,
) {
	return result.some(
		(match) =>
			(match.opponentOne === one && match.opponentTwo === two) ||
			(match.opponentOne === two && match.opponentTwo === one),
	);
}
