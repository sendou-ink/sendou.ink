import { describe, expect, test } from "vitest";
import {
	groupNumberToLetters,
	tournamentBracketChannel,
	tournamentChannel,
	validateBadgeReceivers,
} from "./tournament-bracket-utils";

const groupNumberToLettersParamsToResult = [
	{ groupNumber: 1, expected: "A" },
	{ groupNumber: 26, expected: "Z" },
	{ groupNumber: 27, expected: "AA" },
	{ groupNumber: 52, expected: "AZ" },
	{ groupNumber: 53, expected: "BA" },
	{ groupNumber: 702, expected: "ZZ" },
	{ groupNumber: 703, expected: "AAA" },
];

describe("groupNumberToLetters()", () => {
	for (const { groupNumber, expected } of groupNumberToLettersParamsToResult) {
		test(`groupNumber=${groupNumber} -> ${expected}`, () => {
			expect(groupNumberToLetters(groupNumber)).toBe(expected);
		});
	}
});

describe("tournamentBracketChannel()", () => {
	const channel = (bracketIdx: number, groupId: number | null) =>
		tournamentBracketChannel({ tournamentId: 1, bracketIdx, groupId });

	test("is nested under the tournament's own channel", () => {
		expect(channel(0, null).startsWith(tournamentChannel(1))).toBe(true);
	});

	test("differs per bracket", () => {
		expect(channel(0, null)).not.toBe(channel(1, null));
	});

	test("differs per group when the bracket is viewed one group at a time", () => {
		expect(channel(0, 10)).not.toBe(channel(0, 11));
		expect(channel(0, 10)).not.toBe(channel(0, null));
	});
});

describe("validateNewBadgeOwners", () => {
	const badges = [{ id: 1 }, { id: 2 }];

	test("returns BADGE_NOT_ASSIGNED if a badge has no owner", () => {
		const badgeReceivers = [
			{ badgeId: 1, userIds: [10], tournamentTeamId: 100 },
		];
		expect(validateBadgeReceivers({ badgeReceivers, badges })).toBe(
			"BADGE_NOT_ASSIGNED",
		);
	});

	test("returns BADGE_NOT_ASSIGNED if a badge owner has empty userIds", () => {
		const badgeReceivers = [
			{ badgeId: 1, userIds: [], tournamentTeamId: 100 },
			{ badgeId: 2, userIds: [20], tournamentTeamId: 101 },
		];
		expect(validateBadgeReceivers({ badgeReceivers, badges })).toBe(
			"BADGE_NOT_ASSIGNED",
		);
	});

	test("returns DUPLICATE_TOURNAMENT_TEAM_ID if tournamentTeamId is duplicated", () => {
		const badgeReceivers = [
			{ badgeId: 1, userIds: [10], tournamentTeamId: 100 },
			{ badgeId: 2, userIds: [20], tournamentTeamId: 100 },
		];
		expect(validateBadgeReceivers({ badgeReceivers, badges })).toBe(
			"DUPLICATE_TOURNAMENT_TEAM_ID",
		);
	});

	test("returns BADGE_NOT_FOUND if some receiver has a badge not from the tournament", () => {
		const badgeReceivers = [
			{ badgeId: 1, userIds: [10], tournamentTeamId: 100 },
		];
		expect(
			validateBadgeReceivers({ badgeReceivers, badges: [{ id: 2 }] }),
		).toBe("BADGE_NOT_FOUND");
	});

	test("returns null if all badges are assigned and tournamentTeamIds are unique", () => {
		const badgeReceivers = [
			{ badgeId: 1, userIds: [10], tournamentTeamId: 100 },
			{ badgeId: 2, userIds: [20], tournamentTeamId: 101 },
		];
		expect(validateBadgeReceivers({ badgeReceivers, badges })).toBeNull();
	});
});
