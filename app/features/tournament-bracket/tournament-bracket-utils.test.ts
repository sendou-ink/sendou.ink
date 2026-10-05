import { describe, expect, test } from "vitest";
import {
	groupNumberToLetters,
	tournamentBracketChannel,
	tournamentChannel,
	validateBadgeReceivers,
	validateTrophyReceiver,
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

describe("validateTrophyReceiver", () => {
	const trophy = { id: 1 };
	const soleWinner = [{ memberUserIds: [10, 11] }];
	const coWinners = [{ memberUserIds: [10, 11] }, { memberUserIds: [20, 21] }];

	test.each([
		{
			why: "sole winner's members receive",
			trophyReceiver: { trophyId: 1, userIds: [10, 11] },
			firstPlaceTeams: soleWinner,
			expected: null,
		},
		{
			why: "one receiver per co-winner team",
			trophyReceiver: { trophyId: 1, userIds: [10, 21] },
			firstPlaceTeams: coWinners,
			expected: null,
		},
		{
			why: "a 1st place team without members needs no receiver",
			trophyReceiver: { trophyId: 1, userIds: [10] },
			firstPlaceTeams: [...soleWinner, { memberUserIds: [] }],
			expected: null,
		},
		{
			why: "receiver missing",
			trophyReceiver: null,
			firstPlaceTeams: soleWinner,
			expected: "TROPHY_NOT_FOUND",
		},
		{
			why: "receiver for another trophy",
			trophyReceiver: { trophyId: 2, userIds: [10] },
			firstPlaceTeams: soleWinner,
			expected: "TROPHY_NOT_FOUND",
		},
		{
			why: "nobody picked",
			trophyReceiver: { trophyId: 1, userIds: [] },
			firstPlaceTeams: coWinners,
			expected: "TROPHY_NOT_ASSIGNED",
		},
		{
			why: "receiver not on a 1st place team",
			trophyReceiver: { trophyId: 1, userIds: [10, 30] },
			firstPlaceTeams: soleWinner,
			expected: "TROPHY_RECEIVER_NOT_FIRST_PLACE",
		},
		{
			why: "no 1st place teams",
			trophyReceiver: { trophyId: 1, userIds: [10] },
			firstPlaceTeams: [],
			expected: "TROPHY_RECEIVER_NOT_FIRST_PLACE",
		},
		{
			why: "a co-winner team has no receiver",
			trophyReceiver: { trophyId: 1, userIds: [10, 11] },
			firstPlaceTeams: coWinners,
			expected: "TROPHY_TEAM_NOT_ASSIGNED",
		},
	])("$why -> $expected", ({ trophyReceiver, firstPlaceTeams, expected }) => {
		expect(
			validateTrophyReceiver({ trophyReceiver, trophy, firstPlaceTeams }),
		).toBe(expected);
	});

	test("returns null when the tournament has no trophy", () => {
		expect(
			validateTrophyReceiver({
				trophyReceiver: null,
				trophy: null,
				firstPlaceTeams: soleWinner,
			}),
		).toBeNull();
	});
});
