import { addHours, addMinutes, subHours, subMinutes } from "date-fns";
import * as R from "remeda";
import { describe, expect, test } from "vitest";
import type { PreparedMaps as PreparedMapsType } from "~/db/tables-json";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { nullFilledArray } from "~/utils/arrays";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as Engine from "./engine";
import type { BracketData } from "./engine/types";
import * as PreparedMaps from "./PreparedMaps";
import type * as Progression from "./Progression";
import { getRounds } from "./rounds";
import type { TournamentData } from "./Tournament.server";
import { testTournament, tournamentCtxTeam } from "./tests/test-utils";

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

	test("multiple starting brackets (RR) feeding into SE brackets at same depth should share maps", () => {
		const tournamentWithTwoStartingBrackets = testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{
							type: "round_robin",
							name: "Group A",
							requiresCheckIn: false,
							settings: {},
						},
						{
							type: "round_robin",
							name: "Group B",
							requiresCheckIn: false,
							settings: {},
						},
						{
							type: "single_elimination",
							name: "SE from Group A",
							requiresCheckIn: false,
							settings: {},
							sources: [
								{
									bracketIdx: 0,
									placements: [1, 2],
								},
							],
						},
						{
							type: "single_elimination",
							name: "SE from Group B",
							requiresCheckIn: false,
							settings: {},
							sources: [
								{
									bracketIdx: 1,
									placements: [1, 2],
								},
							],
						},
					],
				},
			},
		});

		const prepared = PreparedMaps.resolvePreparedForTheBracket({
			tournament: tournamentWithTwoStartingBrackets,
			bracketIdx: 3,
			preparedByBracket: [
				null,
				null,
				{ authorId: 1, createdAt: 1, maps: [] },
				null,
			],
		});

		expect(prepared).not.toBeNull();
	});
});

describe("PreparedMaps - eliminationTeamCountOptions", () => {
	const HIGHEST_TESTED_TEAM_COUNT = 256;

	const ELIMINATION_TYPES = [
		"single_elimination",
		"double_elimination",
	] as const;

	test("excludes ranges too small for the count given", () => {
		const options = PreparedMaps.eliminationTeamCountOptions({
			type: "double_elimination",
			currentCount: 3,
		});

		expect(options.some((option) => option.max < 3)).toBe(false);
		expect(options[0]).toEqual({ min: 3, max: 3 });
	});

	test("returns the option equivalent to the current count", () => {
		expect(
			PreparedMaps.eliminationTeamCountOptions({
				type: "double_elimination",
				currentCount: 32,
			})[0].max,
		).toBe(32);
	});

	test("splits a power of two in two for double elimination only", () => {
		const currentCount = 12;

		expect(
			PreparedMaps.eliminationTeamCountOptions({
				type: "double_elimination",
				currentCount,
			})[0].max,
		).toBe(12);
		expect(
			PreparedMaps.eliminationTeamCountOptions({
				type: "single_elimination",
				currentCount,
			})[0].max,
		).toBe(16);
	});

	for (const type of ELIMINATION_TYPES) {
		test(`every ${type} team count plays the same rounds as the max of its range`, () => {
			const mismatches: string[] = [];

			for (
				let teamCount = TOURNAMENT.ENOUGH_TEAMS_TO_START;
				teamCount <= HIGHEST_TESTED_TEAM_COUNT;
				teamCount++
			) {
				const rangeMax = PreparedMaps.eliminationTeamCountOptions({
					type,
					currentCount: teamCount,
				})[0].max;

				const played = playedRoundNames({ type, teamCount });
				const preparedFor = playedRoundNames({ type, teamCount: rangeMax });

				if (!R.isDeepEqual(played, preparedFor)) {
					mismatches.push(
						`${teamCount} teams play [${played.join(", ")}] but preparing for ${rangeMax} shows [${preparedFor.join(", ")}]`,
					);
				}
			}

			expect(mismatches).toEqual([]);
		});
	}

	/** Round names as both the bracket and the prepared maps dialog show them. Third place match left out as it is trimmed separately. */
	function playedRoundNames({
		type,
		teamCount,
	}: {
		type: (typeof ELIMINATION_TYPES)[number];
		teamCount: number;
	}) {
		const bracketData = Engine.create({
			type,
			seeding: nullFilledArray(teamCount).map((_, i) => i + 1),
			settings: {},
		});

		const rounds =
			type === "single_elimination"
				? getRounds({ type: "single", bracketData })
				: [
						...getRounds({ type: "winners", bracketData }),
						...getRounds({ type: "losers", bracketData }),
					];

		return rounds
			.map((round) => round.name)
			.filter((name) => name !== TOURNAMENT.ROUND_NAMES.THIRD_PLACE_MATCH);
	}
});

describe("PreparedMaps - isValidMaxEliminationTeamCount", () => {
	test("accepts a max shared by both elimination types", () => {
		expect(PreparedMaps.isValidMaxEliminationTeamCount(4)).toBe(true);
	});

	test("accepts a max that only double elimination splits at", () => {
		expect(PreparedMaps.isValidMaxEliminationTeamCount(12)).toBe(true);
	});

	test("rejects a count that is not the max of any range", () => {
		expect(PreparedMaps.isValidMaxEliminationTeamCount(5)).toBe(false);
	});

	test("rejects counts outside the supported bracket sizes", () => {
		expect(PreparedMaps.isValidMaxEliminationTeamCount(1)).toBe(false);
		expect(PreparedMaps.isValidMaxEliminationTeamCount(300)).toBe(false);
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
			// biome-ignore lint/suspicious/noNonNullAssertedOptionalChain: Biome 2.3.1 upgrade
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

describe("PreparedMaps - eliminationTeamCountPrefill", () => {
	const teams = ({
		count,
		firstId = 1,
		memberCount = 4,
	}: {
		count: number;
		firstId?: number;
		memberCount?: number;
	}) =>
		nullFilledArray(count).map((_, i) =>
			tournamentCtxTeam(firstId + i, {
				memberUserIds: nullFilledArray(memberCount).map(
					(_, memberIdx) => (firstId + i) * 10 + memberIdx,
				),
			}),
		);

	const tournamentWith = ({
		bracketProgression,
		startsAt,
		regClosesAt,
		isInvitational,
		teams,
		data,
	}: {
		bracketProgression: Progression.ParsedBracket[];
		startsAt: Date;
		regClosesAt?: Date;
		isInvitational?: boolean;
		teams: TournamentData["ctx"]["teams"];
		data?: BracketData;
	}) =>
		testTournament({
			data,
			ctx: {
				startsAt: dateToDatabaseTimestamp(startsAt),
				teams,
				settings: {
					bracketProgression,
					regClosesAt: regClosesAt
						? dateToDatabaseTimestamp(regClosesAt)
						: undefined,
					isInvitational,
				},
			},
		});

	const DOUBLE_ELIMINATION_ONLY: Progression.ParsedBracket[] = [
		{
			type: "double_elimination",
			name: "Main Bracket",
			requiresCheckIn: false,
			settings: {},
		},
	];

	test("prefills with the registered team count when registration has closed", () => {
		const tournament = tournamentWith({
			bracketProgression: DOUBLE_ELIMINATION_ONLY,
			startsAt: subHours(new Date(), 1),
			teams: teams({ count: 12 }),
		});

		expect(
			PreparedMaps.eliminationTeamCountPrefill({ tournament, bracketIdx: 0 }),
		).toBe(12);
	});

	test("does not count teams that never filled their roster", () => {
		const tournament = tournamentWith({
			bracketProgression: DOUBLE_ELIMINATION_ONLY,
			startsAt: addMinutes(new Date(), 30),
			regClosesAt: subMinutes(new Date(), 10),
			teams: [
				...teams({ count: 12 }),
				...teams({ count: 5, firstId: 13, memberCount: 2 }),
			],
		});

		expect(
			PreparedMaps.eliminationTeamCountPrefill({ tournament, bracketIdx: 0 }),
		).toBe(12);
	});

	test("prefills invitational tournaments even if the start time is far away", () => {
		const tournament = tournamentWith({
			bracketProgression: DOUBLE_ELIMINATION_ONLY,
			startsAt: addHours(new Date(), 5),
			isInvitational: true,
			teams: teams({ count: 8 }),
		});

		expect(
			PreparedMaps.eliminationTeamCountPrefill({ tournament, bracketIdx: 0 }),
		).toBe(8);
	});

	test("counts every team of an invitational tournament even if their roster is not full", () => {
		const tournament = tournamentWith({
			bracketProgression: DOUBLE_ELIMINATION_ONLY,
			startsAt: addMinutes(new Date(), 30),
			isInvitational: true,
			teams: [
				...teams({ count: 7 }),
				...teams({ count: 2, firstId: 8, memberCount: 2 }),
			],
		});

		expect(
			PreparedMaps.eliminationTeamCountPrefill({ tournament, bracketIdx: 0 }),
		).toBe(12);
	});

	test("does not prefill while registration is still open", () => {
		const tournament = tournamentWith({
			bracketProgression: DOUBLE_ELIMINATION_ONLY,
			startsAt: addHours(new Date(), 3),
			teams: teams({ count: 12 }),
		});

		expect(
			PreparedMaps.eliminationTeamCountPrefill({ tournament, bracketIdx: 0 }),
		).toBeNull();
	});

	test("prefills with the registered team count when registration is about to close", () => {
		const tournament = tournamentWith({
			bracketProgression: DOUBLE_ELIMINATION_ONLY,
			startsAt: addMinutes(new Date(), 45),
			teams: teams({ count: 12 }),
		});

		expect(
			PreparedMaps.eliminationTeamCountPrefill({ tournament, bracketIdx: 0 }),
		).toBe(16);
	});

	test("overestimates if registration is about to close with the team count near the range max", () => {
		const tournament = tournamentWith({
			bracketProgression: DOUBLE_ELIMINATION_ONLY,
			startsAt: addMinutes(new Date(), 45),
			teams: teams({ count: 15 }),
		});

		expect(
			PreparedMaps.eliminationTeamCountPrefill({ tournament, bracketIdx: 0 }),
		).toBe(24);
	});

	test("prefills a follow-up bracket with the amount of teams that advance", () => {
		const tournament = tournamentWith({
			bracketProgression: [
				{
					type: "round_robin",
					name: "Groups",
					requiresCheckIn: false,
					settings: {},
				},
				{
					type: "single_elimination",
					name: "Top Cut",
					requiresCheckIn: false,
					settings: {},
					sources: [{ bracketIdx: 0, placements: [1, 2] }],
				},
			],
			startsAt: subHours(new Date(), 1),
			teams: teams({ count: 16 }),
		});

		expect(
			PreparedMaps.eliminationTeamCountPrefill({ tournament, bracketIdx: 1 }),
		).toBe(8);
	});

	test("prefills a follow-up bracket with the real participant count of a source bracket that started", () => {
		const startedGroups = Engine.create({
			type: "round_robin",
			seeding: nullFilledArray(12).map((_, i) => i + 1),
			settings: {},
		});

		const tournament = tournamentWith({
			bracketProgression: [
				{
					type: "round_robin",
					name: "Groups",
					requiresCheckIn: true,
					settings: {},
				},
				{
					type: "single_elimination",
					name: "Top Cut",
					requiresCheckIn: false,
					settings: {},
					sources: [{ bracketIdx: 0, placements: [1, 2] }],
				},
			],
			startsAt: subHours(new Date(), 1),
			// 8 of the registered teams never checked in, so they are not in the started bracket
			teams: teams({ count: 20 }),
			data: startedGroups,
		});

		expect(
			tournament.bracketMetaByIdx(0)?.preview,
			"test setup: the source bracket should have started",
		).toBe(false);

		expect(
			PreparedMaps.eliminationTeamCountPrefill({ tournament, bracketIdx: 1 }),
		).toBe(8);
	});

	test("prefills a follow-up bracket sourcing the rest of the teams", () => {
		const tournament = tournamentWith({
			bracketProgression: [
				{
					type: "round_robin",
					name: "Groups",
					requiresCheckIn: false,
					settings: {},
				},
				{
					type: "single_elimination",
					name: "Top Cut",
					requiresCheckIn: false,
					settings: {},
					sources: [{ bracketIdx: 0, placements: [1] }],
				},
				{
					type: "single_elimination",
					name: "Underground Bracket",
					requiresCheckIn: false,
					settings: {},
					sources: [{ bracketIdx: 0, placements: [2], rest: true }],
				},
			],
			startsAt: subHours(new Date(), 1),
			teams: teams({ count: 16 }),
		});

		expect(
			PreparedMaps.eliminationTeamCountPrefill({ tournament, bracketIdx: 2 }),
		).toBe(16);
	});

	test("prefills an underground bracket with the amount of teams eliminated early", () => {
		const tournament = tournamentWith({
			bracketProgression: [
				...DOUBLE_ELIMINATION_ONLY,
				{
					type: "single_elimination",
					name: "Underground Bracket",
					requiresCheckIn: false,
					settings: {},
					sources: [{ bracketIdx: 0, placements: [-1] }],
				},
			],
			startsAt: subHours(new Date(), 1),
			teams: teams({ count: 16 }),
		});

		expect(
			PreparedMaps.eliminationTeamCountPrefill({ tournament, bracketIdx: 1 }),
		).toBe(4);
	});

	test("does not prefill if teams advance based on swiss early advance", () => {
		const tournament = tournamentWith({
			bracketProgression: [
				{
					type: "swiss",
					name: "Swiss",
					requiresCheckIn: false,
					settings: { advanceThreshold: 3 },
				},
				{
					type: "single_elimination",
					name: "Top Cut",
					requiresCheckIn: false,
					settings: {},
					sources: [{ bracketIdx: 0, placements: [] }],
				},
			],
			startsAt: subHours(new Date(), 1),
			teams: teams({ count: 16 }),
		});

		expect(
			PreparedMaps.eliminationTeamCountPrefill({ tournament, bracketIdx: 1 }),
		).toBeNull();
	});

	test("does not prefill a bracket that is not an elimination bracket", () => {
		const tournament = tournamentWith({
			bracketProgression: [
				{
					type: "round_robin",
					name: "Groups",
					requiresCheckIn: false,
					settings: {},
				},
			],
			startsAt: subHours(new Date(), 1),
			teams: teams({ count: 16 }),
		});

		expect(
			PreparedMaps.eliminationTeamCountPrefill({ tournament, bracketIdx: 0 }),
		).toBeNull();
	});
});
