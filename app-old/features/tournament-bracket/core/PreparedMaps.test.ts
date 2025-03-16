import { describe, expect, test } from "vitest";
import type { PreparedMaps as PreparedMapsType } from "~/db/tables";
import * as PreparedMaps from "./PreparedMaps";
import { testTournament } from "./tests/test-utils";

const getTestTournament = (thirdPlaceMatchesForBoth = true) =>
	testTournament({
		ctx: {
			settings: {
				bracketProgression: [
					{
						type: "round_robin",
						name: "Round Robin",
						requiresCheckIn: false,
						settings: {},
						sources: [],
					},
					{
						type: "single_elimination",
						name: "Top Cut",
						requiresCheckIn: false,
						settings: {
							thirdPlaceMatch: true,
						},
						sources: [
							{
								bracketIdx: 0,
								placements: [1, 2],
							},
						],
					},
					{
						type: "single_elimination",
						name: "Underground Bracket",
						requiresCheckIn: false,
						settings: {
							thirdPlaceMatch: thirdPlaceMatchesForBoth,
						},
						sources: [
							{
								bracketIdx: 0,
								placements: [3, 4],
							},
						],
					},
				],
			},
		},
	});

describe("PreparedMaps - resolvePreparedForTheBracket", () => {
	const tournament = getTestTournament();

	test("returns null if no prepared maps at all", () => {
		const prepared = PreparedMaps.resolvePreparedForTheBracket({
			tournament,
			bracketIdx: 1,
		});

		expect(prepared).toBeNull();
	});

	test("returns null if no prepared maps for that bracket", () => {
		const prepared = PreparedMaps.resolvePreparedForTheBracket({
			tournament,
			bracketIdx: 1,
			preparedByBracket: [
				{
					authorId: 1,
					createdAt: 1,
					maps: [],
				},
				null,
				null,
			],
		});

		expect(prepared).toBeNull();
	});

	test("returns prepared maps for that bracket if exists", () => {
		const prepared = PreparedMaps.resolvePreparedForTheBracket({
			tournament,
			bracketIdx: 1,
			preparedByBracket: [
				null,
				{
					authorId: 1,
					createdAt: 1,
					maps: [],
				},
				null,
			],
		});

		expect(prepared).not.toBeNull();
	});

	test("returns 'sibling bracket' prepared maps if exists", () => {
		const prepared = PreparedMaps.resolvePreparedForTheBracket({
			tournament,
			bracketIdx: 1,
			preparedByBracket: [
				null,
				null,
				{
					authorId: 1,
					createdAt: 1,
					maps: [],
				},
			],
		});

		expect(prepared).not.toBeNull();
	});

	test("returns null if the sibling does not have third place match while this one does", () => {
		const tournament = getTestTournament(false);

		const prepared = PreparedMaps.resolvePreparedForTheBracket({
			tournament,
			bracketIdx: 1,
			preparedByBracket: [
				null,
				null,
				{
					authorId: 1,
					createdAt: 1,
					maps: [],
				},
			],
		});

		expect(prepared).toBeNull();
	});
});

describe("PreparedMaps - eliminationTeamCountOptions", () => {
	test("returns options greater than the count given", () => {
		expect(
			PreparedMaps.eliminationTeamCountOptions(3).every(
				(option) => option.max > 3,
			),
		).toBe(true);
	});

	test("returns the option equivalent to the current count", () => {
		expect(PreparedMaps.eliminationTeamCountOptions(32)[0].max).toBe(32);
	});
});

describe("PreparedMaps - trimPreparedEliminationMaps", () => {
	const tournament = testTournament({
		ctx: {
			settings: {
				bracketProgression: [
					{
						type: "single_elimination",
						settings: { thirdPlaceMatch: true },
						name: "X",
						requiresCheckIn: false,
					},
				],
			},
		},
	});

	test("returns null if no prepared maps", () => {
		const trimmed = PreparedMaps.trimPreparedEliminationMaps({
			preparedMaps: null,
			teamCount: 4,
			bracket: tournament.bracketByIdx(0)!,
		});

		expect(trimmed).toBeNull();
	});

	test("returns null if didn't prepare for enough teams", () => {
		const trimmed = PreparedMaps.trimPreparedEliminationMaps({
			preparedMaps: FOUR_TEAM_SE_PREPARED,
			teamCount: 8,
			bracket: tournament.bracketByIdx(0)!,
		});

		expect(trimmed).toBeNull();
	});

	test("returns null if no elimination team count recorded", () => {
		const copy = structuredClone(FOUR_TEAM_SE_PREPARED);
		// biome-ignore lint/performance/noDelete: for testing purposes
		delete copy.eliminationTeamCount;

		const trimmed = PreparedMaps.trimPreparedEliminationMaps({
			preparedMaps: copy,
			teamCount: 4,
			bracket: tournament.bracketByIdx(0)!,
		});

		expect(trimmed).toBeNull();
	});

	test("returns the maps untouched if no need to trim", () => {
		const trimmed = PreparedMaps.trimPreparedEliminationMaps({
			preparedMaps: FOUR_TEAM_SE_PREPARED,
			teamCount: 4,
			bracket: tournament.bracketByIdx(0)!,
		});

		expect(trimmed).toBe(FOUR_TEAM_SE_PREPARED);
	});

	test("returns trimmed if third place match disappeared", () => {
		const trimmed = PreparedMaps.trimPreparedEliminationMaps({
			preparedMaps: FOUR_TEAM_SE_PREPARED,
			teamCount: 3,
			bracket: tournament.bracketByIdx(0)!,
		});

		expect(trimmed?.maps.length).toBe(FOUR_TEAM_SE_PREPARED.maps.length - 1);
		expect(trimmed?.maps.some((m) => m.groupId === 1)).toBe(false);
	});

	test("trims the maps (SE - 1 extra round)", () => {
		const trimmed = PreparedMaps.trimPreparedEliminationMaps({
			preparedMaps: EIGHT_TEAM_SE_PREPARED,
			teamCount: 4,
			bracket: tournament.bracketByIdx(0)!,
		});

		expect(trimmed?.maps.length).toBe(EIGHT_TEAM_SE_PREPARED.maps.length - 1);
	});

	test("trimming happens from the earlier rounds, not the latest", () => {
		const trimmed = PreparedMaps.trimPreparedEliminationMaps({
			preparedMaps: EIGHT_TEAM_SE_PREPARED,
			teamCount: 4,
			bracket: tournament.bracketByIdx(0)!,
		});

		expect(trimmed?.maps[0].list?.[0].stageId).toBe(
			EIGHT_TEAM_SE_PREPARED.maps[1].list?.[0].stageId!,
		);
	});

	test("trimmed rounds have the same round ids (SE)", () => {
		const trimmed = PreparedMaps.trimPreparedEliminationMaps({
			preparedMaps: EIGHT_TEAM_SE_PREPARED,
			teamCount: 4,
			bracket: tournament.bracketByIdx(0)!,
		});

		const actualBracket = tournament
			.bracketByIdx(0)!
			.generateMatchesData([1, 2, 3, 4]);

		for (const round of actualBracket.round) {
			expect(
				trimmed!.maps.some((map) => map.roundId === round.id),
				`Round ID ${round.id} not found in the actual bracket`,
			).toBe(true);
		}
	});

	test("trimmed rounds start with round id 0", () => {
		const trimmed = PreparedMaps.trimPreparedEliminationMaps({
			preparedMaps: EIGHT_TEAM_SE_PREPARED,
			teamCount: 4,
			bracket: tournament.bracketByIdx(0)!,
		});

		expect(trimmed?.maps[0].roundId).toBe(0);
	});

	test("trims the maps (SE - disappearing 3rd place match)", () => {
		const trimmed = PreparedMaps.trimPreparedEliminationMaps({
			preparedMaps: EIGHT_TEAM_SE_PREPARED,
			teamCount: 3,
			bracket: tournament.bracketByIdx(0)!,
		});

		expect(trimmed?.maps.length).toBe(EIGHT_TEAM_SE_PREPARED.maps.length - 2);

		const uniqueGroupIds = new Set(trimmed?.maps.map((map) => map.groupId));

		expect(uniqueGroupIds.size).toBe(1);
	});

	const doubleEliminationTournament = testTournament({
		ctx: {
			settings: {
				bracketProgression: [
					{
						type: "double_elimination",
						settings: { thirdPlaceMatch: true },
						name: "X",
						requiresCheckIn: false,
					},
				],
			},
		},
	});

	test("trims the maps (DE - both winners and losers)", () => {
		const trimmed = PreparedMaps.trimPreparedEliminationMaps({
			preparedMaps: EIGHT_TEAM_DE_PREPARED,
			teamCount: 4,
			bracket: doubleEliminationTournament.bracketByIdx(0)!,
		});

		const expectedWinnersCount = 2;
		const expectedLosersCount = 2;
		const expectedFinalsCount = 2;

		expect(
			trimmed?.maps.filter((m) => m.groupId === 0).length,
			"Winners count is wrong",
		).toBe(expectedWinnersCount);
		expect(
			trimmed?.maps.filter((m) => m.groupId === 1).length,
			"Losers count is wrong",
		).toBe(expectedLosersCount);
		expect(
			trimmed?.maps.filter((m) => m.groupId === 2).length,
			"Finals count is wrong",
		).toBe(expectedFinalsCount);
	});

	test("trimmed rounds have the same round ids (DE)", () => {
		const trimmed = PreparedMaps.trimPreparedEliminationMaps({
			preparedMaps: EIGHT_TEAM_DE_PREPARED,
			teamCount: 4,
			bracket: doubleEliminationTournament.bracketByIdx(0)!,
		});

		const actualBracket = doubleEliminationTournament
			.bracketByIdx(0)!
			.generateMatchesData([1, 2, 3, 4]);

		for (const round of actualBracket.round) {
			expect(
				trimmed!.maps.some((map) => map.roundId === round.id),
				`Round ID ${round.id} not found in the actual bracket`,
			).toBe(true);
		}
	});

	const FOUR_TEAM_SE_PREPARED: PreparedMapsType = {
		maps: [
			{
				roundId: 0,
				groupId: 0,
				list: [
					{
						mode: "TC",
						stageId: 10,
					},
					{
						mode: "RM",
						stageId: 4,
					},
					{
						mode: "SZ",
						stageId: 18,
					},
					{
						mode: "CB",
						stageId: 13,
					},
					{
						mode: "TC",
						stageId: 1,
					},
				],
				count: 5,
				type: "BEST_OF",
			},
			{
				roundId: 1,
				groupId: 0,
				list: [
					{
						mode: "CB",
						stageId: 16,
					},
					{
						mode: "TC",
						stageId: 21,
					},
					{
						mode: "SZ",
						stageId: 2,
					},
					{
						mode: "RM",
						stageId: 12,
					},
					{
						mode: "CB",
						stageId: 14,
					},
				],
				count: 5,
				type: "BEST_OF",
			},
			{
				roundId: 2,
				groupId: 1,
				list: [
					{
						mode: "TC",
						stageId: 3,
					},
					{
						mode: "RM",
						stageId: 0,
					},
					{
						mode: "SZ",
						stageId: 7,
					},
					{
						mode: "CB",
						stageId: 15,
					},
					{
						mode: "TC",
						stageId: 6,
					},
				],
				count: 5,
				type: "BEST_OF",
			},
		],
		authorId: 274,
		eliminationTeamCount: 4,
		createdAt: 1724481143,
	};

	const EIGHT_TEAM_SE_PREPARED: PreparedMapsType = {
		maps: [
			{
				roundId: 0,
				groupId: 0,
				list: [
					{
						mode: "CB",
						stageId: 0,
					},
					{
						mode: "TC",
						stageId: 21,
					},
					{
						mode: "SZ",
						stageId: 2,
					},
				],
				count: 3,
				type: "BEST_OF",
			},
			{
				roundId: 1,
				groupId: 0,
				list: [
					{
						mode: "RM",
						stageId: 3,
					},
					{
						mode: "SZ",
						stageId: 18,
					},
					{
						mode: "CB",
						stageId: 13,
					},
					{
						mode: "TC",
						stageId: 1,
					},
					{
						mode: "RM",
						stageId: 4,
					},
				],
				count: 5,
				type: "BEST_OF",
			},
			{
				roundId: 2,
				groupId: 0,
				list: [
					{
						mode: "CB",
						stageId: 15,
					},
					{
						mode: "TC",
						stageId: 6,
					},
					{
						mode: "SZ",
						stageId: 10,
					},
					{
						mode: "RM",
						stageId: 12,
					},
					{
						mode: "CB",
						stageId: 16,
					},
				],
				count: 5,
				type: "BEST_OF",
			},
			{
				roundId: 3,
				groupId: 1,
				list: [
					{
						mode: "CB",
						stageId: 14,
					},
					{
						mode: "SZ",
						stageId: 7,
					},
					{
						mode: "TC",
						stageId: 19,
					},
					{
						mode: "RM",
						stageId: 2,
					},
					{
						mode: "CB",
						stageId: 8,
					},
				],
				count: 5,
				type: "BEST_OF",
			},
		],
		authorId: 274,
		eliminationTeamCount: 8,
		createdAt: 1724481176,
	};

	const EIGHT_TEAM_DE_PREPARED: PreparedMapsType = {
		maps: [
			{
				roundId: 0,
				groupId: 0,
				list: [
					{
						mode: "SZ",
						stageId: 18,
					},
					{
						mode: "CB",
						stageId: 0,
					},
					{
						mode: "TC",
						stageId: 10,
					},
				],
				count: 3,
				type: "BEST_OF",
			},
			{
				roundId: 3,
				groupId: 1,
				list: [
					{
						mode: "CB",
						stageId: 13,
					},
					{
						mode: "TC",
						stageId: 1,
					},
					{
						mode: "SZ",
						stageId: 2,
					},
				],
				count: 3,
				type: "BEST_OF",
			},
			{
				roundId: 1,
				groupId: 0,
				list: [
					{
						mode: "RM",
						stageId: 4,
					},
					{
						mode: "SZ",
						stageId: 8,
					},
					{
						mode: "CB",
						stageId: 21,
					},
				],
				count: 3,
				type: "BEST_OF",
			},
			{
				roundId: 4,
				groupId: 1,
				list: [
					{
						mode: "TC",
						stageId: 6,
					},
					{
						mode: "RM",
						stageId: 12,
					},
					{
						mode: "SZ",
						stageId: 7,
					},
				],
				count: 3,
				type: "BEST_OF",
			},
			{
				roundId: 2,
				groupId: 0,
				list: [
					{
						mode: "CB",
						stageId: 16,
					},
					{
						mode: "SZ",
						stageId: 18,
					},
					{
						mode: "TC",
						stageId: 3,
					},
					{
						mode: "RM",
						stageId: 0,
					},
					{
						mode: "CB",
						stageId: 14,
					},
				],
				count: 5,
				type: "BEST_OF",
			},
			{
				roundId: 5,
				groupId: 1,
				list: [
					{
						mode: "CB",
						stageId: 15,
					},
					{
						mode: "TC",
						stageId: 19,
					},
					{
						mode: "SZ",
						stageId: 10,
					},
				],
				count: 3,
				type: "BEST_OF",
			},
			{
				roundId: 6,
				groupId: 1,
				list: [
					{
						mode: "RM",
						stageId: 2,
					},
					{
						mode: "TC",
						stageId: 1,
					},
					{
						mode: "SZ",
						stageId: 8,
					},
					{
						mode: "CB",
						stageId: 13,
					},
					{
						mode: "RM",
						stageId: 4,
					},
				],
				count: 5,
				type: "BEST_OF",
			},
			{
				roundId: 7,
				groupId: 2,
				list: [
					{
						mode: "RM",
						stageId: 6,
					},
					{
						mode: "SZ",
						stageId: 21,
					},
					{
						mode: "TC",
						stageId: 3,
					},
					{
						mode: "CB",
						stageId: 14,
					},
					{
						mode: "RM",
						stageId: 12,
					},
				],
				count: 5,
				type: "BEST_OF",
			},
			{
				roundId: 8,
				groupId: 2,
				list: [
					{
						mode: "TC",
						stageId: 10,
					},
					{
						mode: "RM",
						stageId: 18,
					},
					{
						mode: "SZ",
						stageId: 7,
					},
					{
						mode: "CB",
						stageId: 0,
					},
					{
						mode: "TC",
						stageId: 19,
					},
				],
				count: 5,
				type: "BEST_OF",
			},
		],
		authorId: 274,
		eliminationTeamCount: 8,
		createdAt: 1724482944,
	};
});
