import * as R from "remeda";
import { describe, expect, test } from "vitest";
import * as Engine from "./engine";
import * as Seeding from "./Seeding";

// first round lineups of the standard bracket ("space_between") by bracket size,
// written out independently of the implementation. 1-based seed numbers.
const LINEUP_8 = [1, 8, 4, 5, 2, 7, 3, 6];
const LINEUP_16 = [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11];

describe("Seeding.forFollowUpBracket()", () => {
	describe("group spreading", () => {
		test("spreads 4 groups of 4 across the quarters of a 16 bracket", () => {
			const { teams, input } = groupsOfFour();

			const result = Seeding.forFollowUpBracket({
				teams,
				...input,
			});

			for (const quarter of sections(result, LINEUP_16, 4)) {
				expect(new Set(quarter.map(groupOf)).size).toBe(4);
			}
		});

		test("keeps placement tiers intact while spreading", () => {
			const { teams, input } = groupsOfFour();

			const result = Seeding.forFollowUpBracket({
				teams,
				...input,
			});

			for (const [seedIdx, teamId] of result.entries()) {
				expect(tierOf(teamId)).toBe(tierOf(teams[seedIdx]));
			}
		});

		test("does not reorder the group winners (best two can only meet in the finals)", () => {
			const { teams, input } = groupsOfFour();

			const result = Seeding.forFollowUpBracket({
				teams,
				...input,
			});

			expect(result.slice(0, 4)).toEqual(teams.slice(0, 4));
		});

		test("spreads 4 groups of 2 across the halves of an 8 bracket", () => {
			const groups = [
				[101, 102],
				[201, 202],
				[301, 302],
				[401, 402],
			];
			const teams = [101, 201, 301, 401, 102, 202, 302, 402];

			const result = Seeding.forFollowUpBracket({
				teams,
				...groupsInput(groups),
			});

			for (const half of sections(result, LINEUP_8, 4)) {
				expect(new Set(half.map(groupOf)).size).toBe(4);
			}
		});

		test("keeps 2 groups of 4 out of same group round 1 matches (Swiss top cut shape)", () => {
			const groups = [
				[101, 102, 103, 104],
				[201, 202, 203, 204],
			];
			const teams = [101, 201, 102, 202, 103, 203, 104, 204];

			const result = Seeding.forFollowUpBracket({
				teams,
				...groupsInput(groups),
			});

			for (const match of firstRoundMatches(result, LINEUP_8)) {
				expect(groupOf(match[0])).not.toBe(groupOf(match[1]));
			}
		});

		test("returns the incoming order when each group sends one team", () => {
			const groups = [[101], [201], [301], [401], [501], [601], [701], [801]];
			const teams = [101, 201, 301, 401, 501, 601, 701, 801];

			const result = Seeding.forFollowUpBracket({
				teams,
				...groupsInput(groups),
			});

			expect(result).toEqual(teams);
		});

		test("spreads 3 groups of 4 across the quarters of a 12 team bracket (byes)", () => {
			const groups = [
				[101, 102, 103, 104],
				[201, 202, 203, 204],
				[301, 302, 303, 304],
			];
			const teams = [
				101, 201, 301, 102, 202, 302, 103, 203, 303, 104, 204, 304,
			];

			const result = Seeding.forFollowUpBracket({
				teams,
				...groupsInput(groups),
			});

			for (const quarter of sections(result, LINEUP_16, 4)) {
				const quarterGroups = quarter.map(groupOf);
				expect(new Set(quarterGroups).size).toBe(quarterGroups.length);
			}
		});

		test("spreads groups of uneven sizes (a team missing due to no check-in)", () => {
			const groups = [
				[101, 102, 103, 104],
				[201, 202, 203, 204],
				[301, 302, 303, 304],
				[401, 402, 403],
			];
			const teams = [
				101, 201, 301, 401, 102, 202, 302, 402, 103, 203, 303, 403, 104, 204,
				304,
			];

			const result = Seeding.forFollowUpBracket({
				teams,
				...groupsInput(groups),
			});

			for (const quarter of sections(result, LINEUP_16, 4)) {
				const quarterGroups = quarter.map(groupOf);
				expect(new Set(quarterGroups).size).toBe(quarterGroups.length);
			}
		});

		test("spreads by the group given, not by the source a team's tier comes from", () => {
			// group winners come from the main bracket, the runners-up through a redemption bracket
			const teams = [101, 201, 301, 401, 102, 202, 302, 402];
			const placementOne = (teamIds: number[]) =>
				teamIds.map((tournamentTeamId) => ({ tournamentTeamId, placement: 1 }));

			const result = Seeding.forFollowUpBracket({
				teams,
				sources: [
					{ standings: placementOne(teams.slice(0, 4)), encounters: [] },
					{ standings: placementOne(teams.slice(4)), encounters: [] },
				],
				groupKeyByTeamId: new Map(
					teams.map((teamId) => [teamId, String(groupOf(teamId))]),
				),
			});

			for (const half of sections(result, LINEUP_8, 4)) {
				expect(new Set(half.map(groupOf)).size).toBe(4);
			}
		});

		test("halves the group block size when the ideal spread is unreachable", () => {
			// The two groups of four cannot hold a quarter each: only two quarters are
			// reachable by their two lowest placement tiers, and both tiers are needed
			// by both groups. The halved block size is satisfiable though, and it still
			// spreads the group of two across quarters (the incoming order does not).
			const groups = [
				[101, 102, 103, 104],
				[201, 202, 203, 204],
				[301, 302],
			];
			const teams = [101, 201, 301, 102, 202, 302, 103, 203, 104, 204];

			const result = Seeding.forFollowUpBracket({
				teams,
				...groupsInput(groups),
			});

			const quarters = sections(result, LINEUP_16, 4);
			const quarterOf = (teamId: number) =>
				quarters.findIndex((quarter) => quarter.includes(teamId));
			expect(quarterOf(301)).not.toBe(quarterOf(302));

			for (const match of firstRoundMatches(result, LINEUP_16)) {
				expect(groupOf(match[0])).not.toBe(groupOf(match[1]));
			}

			for (const [seedIdx, teamId] of result.entries()) {
				expect(tierOf(teamId)).toBe(tierOf(teams[seedIdx]));
			}
		});
	});

	describe("grouped elimination", () => {
		// engine groups and round 1 matches are read from the bracket the engine creates with the
		// result as its seeding, so they hold only if seeding lays out the groups like the engine.
		// With a power of two group count the engine groups coincide with the sections of one bracket,
		// 3 groups and groups padded to different sizes are where the grouped layout differs.
		test.each([
			{
				why: "2 groups, 8 teams from 4 groups of 2",
				type: "single_elimination" as const,
				groupCount: 2,
				groups: [
					[101, 102],
					[201, 202],
					[301, 302],
					[401, 402],
				],
			},
			{
				why: "2 groups of 3 and 4 teams, 7 teams from 5 groups",
				type: "single_elimination" as const,
				groupCount: 2,
				groups: [[101, 102], [201, 202], [301], [401], [501]],
			},
			{
				why: "3 groups, 12 teams from 4 groups of 3",
				type: "single_elimination" as const,
				groupCount: 3,
				groups: [
					[101, 102, 103],
					[201, 202, 203],
					[301, 302, 303],
					[401, 402, 403],
				],
			},
			{
				why: "4 groups, 16 teams from 4 groups of 4",
				type: "single_elimination" as const,
				groupCount: 4,
				groups: groupsOfFour().groups,
			},
			{
				why: "4 groups of 3 and 4 teams, 14 teams from groups of 4 and 3",
				type: "single_elimination" as const,
				groupCount: 4,
				groups: [
					[101, 102, 103, 104],
					[201, 202, 203, 204],
					[301, 302, 303],
					[401, 402, 403],
				],
			},
			{
				why: "4 groups, 16 teams from 4 groups of 4, double elimination",
				type: "double_elimination" as const,
				groupCount: 4,
				groups: groupsOfFour().groups,
			},
		])(
			"spreads each group's teams into separate engine groups ($why)",
			({ type, groupCount, groups }) => {
				const teams = teamsByTier(groups);

				const result = Seeding.forFollowUpBracket({
					teams,
					...groupsInput(groups),
					groupCount,
				});

				const engineGroups = engineFirstRoundLineups(result, type, groupCount);
				expect(engineGroups).toHaveLength(groupCount);
				for (const lineup of engineGroups) {
					const lineupGroups = lineup.flatMap((teamId) =>
						teamId === null ? [] : [groupOf(teamId)],
					);
					expect(new Set(lineupGroups).size).toBe(lineupGroups.length);
				}

				for (const [seedIdx, teamId] of result.entries()) {
					expect(tierOf(teamId)).toBe(tierOf(teams[seedIdx]));
				}
			},
		);

		test.each([
			{
				why: "2 groups, 8 teams from 2 groups of 4 (Swiss top cut shape)",
				groupCount: 2,
				groups: [
					[101, 102, 103, 104],
					[201, 202, 203, 204],
				],
			},
			{
				why: "2 groups of 3 and 4 teams, 7 teams from groups of 3 and 2",
				groupCount: 2,
				groups: [
					[101, 102, 103],
					[201, 202],
					[301, 302],
				],
			},
			{
				why: "4 groups of 2 and 3 teams, 10 teams from 2 groups of 5",
				groupCount: 4,
				groups: [
					[101, 102, 103, 104, 105],
					[201, 202, 203, 204, 205],
				],
			},
		])(
			"keeps teams of a group out of the same round 1 match when they outnumber the engine groups ($why)",
			({ groupCount, groups }) => {
				const teams = teamsByTier(groups);

				const result = Seeding.forFollowUpBracket({
					teams,
					...groupsInput(groups),
					groupCount,
				});

				for (const [one, two] of engineFirstRoundMatches(result, groupCount)) {
					expect(groupOf(one)).not.toBe(groupOf(two));
				}
			},
		);

		test.each([
			{
				why: "2 groups, 9 teams: seeds 2 and 7 open the 4 team group",
				groupCount: 2,
				teamCount: 9,
				encounter: [2, 7] as [number, number],
			},
			{
				why: "4 groups, 10 teams: seeds 3 and 6 make up a 2 team group",
				groupCount: 4,
				teamCount: 10,
				encounter: [3, 6] as [number, number],
			},
		])(
			"avoids a round 1 rematch in a group padded smaller than the biggest one ($why)",
			({ groupCount, teamCount, encounter }) => {
				const teams = Array.from({ length: teamCount }, (_, i) => i + 1);
				const isRematch = ([one, two]: [number, number]) =>
					encounterKey(one, two) === encounterKey(...encounter);

				expect(engineFirstRoundMatches(teams, groupCount).some(isRematch)).toBe(
					true,
				);

				const result = Seeding.forFollowUpBracket({
					teams,
					...singleGroupInput(teams, [encounter]),
					groupCount,
				});

				expect(
					engineFirstRoundMatches(result, groupCount).some(isRematch),
				).toBe(false);
			},
		);
	});

	describe("previous encounter avoidance", () => {
		test("single group: avoids a round 1 rematch by reordering the bottom half", () => {
			const teams = [1, 2, 3, 4, 5, 6, 7, 8];

			const result = Seeding.forFollowUpBracket({
				teams,
				...singleGroupInput(teams, [[1, 8]]),
			});

			expect(result).toEqual([1, 2, 3, 4, 5, 6, 8, 7]);
		});

		test("single group: reorders only the bottom half even when every natural match would be a rematch", () => {
			const teams = [1, 2, 3, 4, 5, 6, 7, 8];
			const naturalMatches: Array<[number, number]> = [
				[1, 8],
				[2, 7],
				[3, 6],
				[4, 5],
			];

			const result = Seeding.forFollowUpBracket({
				teams,
				...singleGroupInput(teams, naturalMatches),
			});

			expect(result.slice(0, 4)).toEqual([1, 2, 3, 4]);

			const rematchKeys = new Set(naturalMatches.map((pair) => pair.join(":")));
			for (const match of firstRoundMatches(result, LINEUP_8)) {
				const key = match.toSorted((a, b) => a - b).join(":");
				expect(rematchKeys.has(key)).toBe(false);
			}
		});

		test("single group: falls back to the incoming order when rematches are unavoidable", () => {
			const teams = [1, 2, 3, 4, 5, 6, 7, 8];
			const everyPair: Array<[number, number]> = [];
			for (const one of teams) {
				for (const two of teams) {
					if (one < two) everyPair.push([one, two]);
				}
			}

			const result = Seeding.forFollowUpBracket({
				teams,
				...singleGroupInput(teams, everyPair),
			});

			expect(result).toEqual(teams);
		});

		test("single group: counts the middle seed of an odd team count into the bottom half", () => {
			// with 13 teams the top half is seeds 1-6, leaving seeds 7-13 interchangeable.
			// Team 5 has played every one of those but team 7, so team 7 is the only team
			// that can take seed 12, the seed team 5 faces in round 1.
			const teams = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
			const encounters: Array<[number, number]> = [
				[5, 8],
				[5, 9],
				[5, 10],
				[5, 11],
				[5, 12],
				[5, 13],
			];

			const result = Seeding.forFollowUpBracket({
				teams,
				...singleGroupInput(teams, encounters),
			});

			expect(result.slice(0, 6)).toEqual([1, 2, 3, 4, 5, 6]);
			expect(result[11]).toBe(7);

			const rematchKeys = new Set(encounters.map((pair) => pair.join(":")));
			for (const match of firstRoundMatches(result, LINEUP_16)) {
				const key = match.toSorted((a, b) => a - b).join(":");
				expect(rematchKeys.has(key)).toBe(false);
			}
		});

		test("single group: returns a complete lineup when the search runs out of nodes", () => {
			// team 1 has played every team of the bottom half pool, so no arrangement of
			// it avoids their round 1 rematch and the search exhausts its node budget
			// before the next relaxation rung takes over
			const teams = Array.from({ length: 16 }, (_, i) => i + 1);
			const encounters = teams
				.slice(8)
				.map((teamId): [number, number] => [1, teamId]);

			const result = Seeding.forFollowUpBracket({
				teams,
				...singleGroupInput(teams, encounters),
			});

			expect(result).toEqual(teams);
		});
	});

	test("returns the incoming order for fewer than 4 teams", () => {
		const teams = [1, 2, 3];

		const result = Seeding.forFollowUpBracket({
			teams,
			...singleGroupInput(teams, [[1, 2]]),
		});

		expect(result).toEqual(teams);
	});
});

/** teams encoded as group * 100 + placement, e.g. 203 = third place of the second group */
function groupOf(teamId: number) {
	return Math.floor(teamId / 100);
}

function tierOf(teamId: number) {
	return teamId % 100;
}

function groupsOfFour() {
	const groups = [
		[101, 102, 103, 104],
		[201, 202, 203, 204],
		[301, 302, 303, 304],
		[401, 402, 403, 404],
	];
	const teams = [
		101, 201, 301, 401, 102, 202, 302, 402, 103, 203, 303, 403, 104, 204, 304,
		404,
	];

	return { teams, groups, input: groupsInput(groups) };
}

/** every group's winner first, then every group's runner-up and so on */
function teamsByTier(groups: number[][]) {
	const maxPlacements = Math.max(...groups.map((group) => group.length));

	return Array.from({ length: maxPlacements }, (_, placementIdx) =>
		groups.flatMap((group) =>
			group[placementIdx] ? [group[placementIdx]] : [],
		),
	).flat();
}

function engineFirstRoundMatches(seeding: number[], groupCount: number) {
	return engineFirstRoundLineups(
		seeding,
		"single_elimination",
		groupCount,
	).flatMap((lineup) =>
		R.chunk(lineup, 2).flatMap(
			([one, two]): Array<[number, number]> =>
				typeof one === "number" && typeof two === "number" ? [[one, two]] : [],
		),
	);
}

function encounterKey(one: number, two: number) {
	return one < two ? `${one}:${two}` : `${two}:${one}`;
}

/** each engine group's first round lineup (null = BYE) of the elimination bracket the engine creates from the seeding */
function engineFirstRoundLineups(
	seeding: number[],
	type: "single_elimination" | "double_elimination",
	groupCount: number,
) {
	const data = Engine.create({ type, seeding, settings: { groupCount } });

	return data.group.map((group) => {
		const firstRound = data.round.find(
			(round) =>
				round.groupId === group.id &&
				round.section === "winners" &&
				round.number === 1,
		)!;

		return data.match
			.filter((match) => match.roundId === firstRound.id)
			.toSorted((a, b) => a.number - b.number)
			.flatMap((match) => [
				match.opponent1?.id ?? null,
				match.opponent2?.id ?? null,
			]);
	});
}

type FollowUpBracketInput = Pick<
	Parameters<typeof Seeding.forFollowUpBracket>[0],
	"sources" | "groupKeyByTeamId"
>;

function groupsInput(groups: number[][]): FollowUpBracketInput {
	const standings: Seeding.FollowUpBracketSource["standings"] = [];
	const groupKeyByTeamId = new Map<number, string>();

	const maxPlacements = Math.max(...groups.map((group) => group.length));
	for (let placement = 1; placement <= maxPlacements; placement++) {
		for (const [groupIdx, group] of groups.entries()) {
			const tournamentTeamId = group[placement - 1];
			if (!tournamentTeamId) continue;

			standings.push({ tournamentTeamId, placement });
			groupKeyByTeamId.set(tournamentTeamId, String(groupIdx + 1));
		}
	}

	// every group member has faced every other (round robin)
	const encounters: Array<[number, number]> = [];
	for (const group of groups) {
		for (const one of group) {
			for (const two of group) {
				if (one < two) encounters.push([one, two]);
			}
		}
	}

	return { sources: [{ standings, encounters }], groupKeyByTeamId };
}

function singleGroupInput(
	teams: number[],
	encounters: Array<[number, number]>,
): FollowUpBracketInput {
	return {
		sources: [
			{
				standings: teams.map((tournamentTeamId, i) => ({
					tournamentTeamId,
					placement: i + 1,
				})),
				encounters,
			},
		],
		groupKeyByTeamId: new Map(teams.map((teamId) => [teamId, "single"])),
	};
}

/** slices the bracket's first round lineup into its aligned sections (e.g. quarters
 * for sectionSize 4), dropping BYE slots */
function sections(result: number[], lineup: number[], sectionSize: number) {
	const lineupTeams = lineup.map((seed) => result[seed - 1]);

	const out: number[][] = [];
	for (let i = 0; i < lineupTeams.length; i += sectionSize) {
		out.push(
			lineupTeams
				.slice(i, i + sectionSize)
				.filter((teamId) => teamId !== undefined),
		);
	}
	return out;
}

function firstRoundMatches(result: number[], lineup: number[]) {
	return sections(result, lineup, 2).filter((match) => match.length === 2);
}
