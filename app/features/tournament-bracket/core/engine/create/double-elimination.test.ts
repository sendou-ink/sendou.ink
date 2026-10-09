import { describe, expect, test } from "vitest";
import type { BracketData } from "../types";
import { createResolved } from "./index";

describe("Create double elimination stage", () => {
	test("creates a double elimination stage", () => {
		const data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: {},
		});

		expect(data.stage[0].type).toBe("double_elimination");

		expect(data.group.length).toBe(1);
		expect(roundCountBySection(data)).toEqual({
			winners: 4,
			losers: 6,
			finals: 2,
		});
		expect(data.match.length).toBe(31);
	});

	test("creates a tournament with 256+ tournaments", () => {
		expect(() =>
			createResolved({
				type: "double_elimination",
				seeding: Array.from({ length: 256 }, (_, i) => i + 1),
				settings: {},
			}),
		).not.toThrow();
	});

	test("creates a tournament with a double grand final", () => {
		const data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {},
		});

		expect(data.group.length).toBe(1);
		expect(roundCountBySection(data)).toEqual({
			winners: 3,
			losers: 4,
			finals: 2,
		});
		expect(data.match.length).toBe(15);
	});

	test("skipped rounds are not created", () => {
		const data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {
				skippedRounds: [
					"LB_SEMIS",
					"LB_FINALS",
					"GRAND_FINALS",
					"BRACKET_RESET",
				],
			},
		});

		expect(roundCountBySection(data)).toEqual({
			winners: 3,
			losers: 2,
		});
		expect(data.match.length).toBe(7 + 2 + 2);
	});

	test("splits into groups, each its own bracket", () => {
		const data = createResolved({
			type: "double_elimination",
			seeding: Array.from({ length: 14 }, (_, i) => i + 1),
			settings: { groupCount: 2 },
		});

		expect(data.group.length).toBe(2);

		for (const group of data.group) {
			const groupTeamIds = data.match
				.filter((match) => match.groupId === group.id)
				.flatMap((match) => [match.opponent1?.id, match.opponent2?.id])
				.filter((id) => typeof id === "number");

			expect(new Set(groupTeamIds).size).toBe(7);
			expect(
				data.round.filter((round) => round.groupId === group.id).length,
			).toBe(3 + 4 + 2);
		}
	});

	test("every group has a match with the winners bracket finals skipped", () => {
		// groups of 3, 2, 2 and 2
		const data = createResolved({
			type: "double_elimination",
			seeding: Array.from({ length: 9 }, (_, i) => i + 1),
			settings: {
				groupCount: 4,
				skippedRounds: [
					"WB_FINALS",
					"LB_FINALS",
					"GRAND_FINALS",
					"BRACKET_RESET",
				],
			},
		});

		const groupIdsWithoutMatches = data.group
			.filter(
				(group) =>
					!data.match.some(
						(match) =>
							match.groupId === group.id && match.opponent1 && match.opponent2,
					),
			)
			.map((group) => group.id);

		expect(groupIdsWithoutMatches).toEqual([]);
	});

	test("plays the winners bracket finals when it is the only match of 2 teams", () => {
		const data = createResolved({
			type: "double_elimination",
			seeding: [1, 2],
			settings: {
				skippedRounds: [
					"WB_FINALS",
					"LB_FINALS",
					"GRAND_FINALS",
					"BRACKET_RESET",
				],
			},
		});

		expect(data.round.map((round) => [round.section, round.number])).toEqual([
			["winners", 1],
		]);
		expect(data.match).toHaveLength(1);
	});

	test("groups are seeded like round robin groups", () => {
		const data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: { groupCount: 2 },
		});

		const teamIdsOfGroup = (groupId: number) =>
			[
				...new Set(
					data.match
						.filter((match) => match.groupId === groupId)
						.flatMap((match) => [match.opponent1?.id, match.opponent2?.id])
						.filter((id) => typeof id === "number"),
				),
			].sort((a, b) => a - b);

		expect(teamIdsOfGroup(data.group[0].id)).toEqual([1, 4, 5, 8]);
		expect(teamIdsOfGroup(data.group[1].id)).toEqual([2, 3, 6, 7]);
	});
});

function roundCountBySection(data: BracketData) {
	const counts: Record<string, number> = {};
	for (const round of data.round) {
		counts[String(round.section)] = (counts[String(round.section)] ?? 0) + 1;
	}

	return counts;
}
