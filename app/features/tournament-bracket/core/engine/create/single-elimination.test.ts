import { describe, expect, test } from "vitest";
import type { BracketData } from "../types";
import { createResolved } from "./index";

describe("Create single elimination stage", () => {
	test("creates a single elimination stage", () => {
		const data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: {},
		});

		expect(data.stage[0].type).toBe("single_elimination");

		expect(data.group.length).toBe(1);
		expect(data.round.length).toBe(4);
		expect(data.match.length).toBe(15);
	});

	test("creates a single elimination stage with BYEs", () => {
		const data = createResolved({
			type: "single_elimination",
			seeding: [1, null, 3, 4, null, null, 7, 8],
			settings: {},
		});

		expect(matchById(data, 4).opponent1?.id).toBe(null);
		expect(matchById(data, 4).opponent2?.id).toBe(4);
		expect(matchById(data, 5).opponent1?.id).toBe(7);
		expect(matchById(data, 5).opponent2?.id).toBe(3);
	});

	test("creates a single elimination stage with consolation final", () => {
		const data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: { consolationFinal: true },
		});

		expect(data.group.length).toBe(1);
		expect(data.round.length).toBe(4);
		expect(data.round.at(-1)?.section).toBe("finals");
		expect(data.match.length).toBe(8);
	});

	test("creates a single elimination stage with consolation final and BYEs", () => {
		const data = createResolved({
			type: "single_elimination",
			seeding: [null, null, null, 4, 5, 6, 7, 8],
			settings: { consolationFinal: true },
		});

		expect(matchById(data, 4).opponent1?.id).toBe(8);
		expect(matchById(data, 4).opponent2?.id).toBe(null);

		// Consolation final
		expect(matchById(data, 7).opponent1?.id).toBe(null);
		expect(matchById(data, 7).opponent2?.id).toBe(null);
	});

	test("creates a single elimination stage with Bo3 matches", () => {
		const data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {},
		});

		expect(data.group.length).toBe(1);
		expect(data.round.length).toBe(3);
		expect(data.match.length).toBe(7);
	});

	test("skipped finals leave the third place match", () => {
		const data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: { consolationFinal: true, skippedRounds: ["FINALS"] },
		});

		expect(data.round.map((round) => [round.section, round.number])).toEqual([
			["winners", 1],
			["winners", 2],
			["finals", 1],
		]);
	});

	test("skipped semifinals leave out the semifinals and everything after", () => {
		const data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: { consolationFinal: true, skippedRounds: ["SEMIS"] },
		});

		expect(data.round.length).toBe(2);
		expect(data.match.length).toBe(8 + 4);
	});

	test("groups get a third place match only with at least 4 teams", () => {
		// groups of 3 and 4 teams
		const data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7],
			settings: { consolationFinal: true, groupCount: 2 },
		});

		expect(data.group.length).toBe(2);
		expect(
			data.round
				.filter((round) => round.section === "finals")
				.map((round) => round.groupId),
		).toEqual([data.group[1].id]);
	});

	test.each([
		{ teamCount: 4, why: "two groups of 2" },
		{ teamCount: 5, why: "groups of 3 and 2" },
	])(
		"every group has a match with the finals skipped ($why)",
		({ teamCount }) => {
			const data = createResolved({
				type: "single_elimination",
				seeding: Array.from({ length: teamCount }, (_, i) => i + 1),
				settings: {
					groupCount: 2,
					skippedRounds: ["FINALS", "THIRD_PLACE_MATCH"],
				},
			});

			expect(groupIdsWithoutMatches(data)).toEqual([]);
		},
	);

	test.each([
		{
			teamCount: 4,
			skippedRounds: ["SEMIS", "FINALS", "THIRD_PLACE_MATCH"] as const,
			why: "semis played, finals still skipped",
		},
		{
			teamCount: 3,
			skippedRounds: ["SEMIS", "FINALS", "THIRD_PLACE_MATCH"] as const,
			why: "semis with a BYE played",
		},
		{
			teamCount: 2,
			skippedRounds: ["FINALS", "THIRD_PLACE_MATCH"] as const,
			why: "finals played",
		},
	])(
		"plays the fewest skipped rounds needed for a match with $teamCount teams ($why)",
		({ teamCount, skippedRounds }) => {
			const data = createResolved({
				type: "single_elimination",
				seeding: Array.from({ length: teamCount }, (_, i) => i + 1),
				settings: { skippedRounds: [...skippedRounds] },
			});

			expect(data.round.map((round) => [round.section, round.number])).toEqual([
				["winners", 1],
			]);
		},
	);

	test("throws if the seeding has duplicate participants", () => {
		expect(() =>
			createResolved({
				type: "single_elimination",
				seeding: [
					1,
					1, // Duplicate
					3,
					4,
				],
				settings: {},
			}),
		).toThrow("The seeding has a duplicate participant.");
	});
});

function matchById(data: BracketData, id: number) {
	const found = data.match.find((match) => match.id === id);
	if (!found) throw new Error(`Match ${id} not found`);

	return found;
}

function groupIdsWithoutMatches(data: BracketData) {
	return data.group
		.filter(
			(group) =>
				!data.match.some(
					(match) =>
						match.groupId === group.id && match.opponent1 && match.opponent2,
				),
		)
		.map((group) => group.id);
}
