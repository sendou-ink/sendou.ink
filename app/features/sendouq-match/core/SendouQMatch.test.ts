import { subDays, subMonths } from "date-fns";
import { describe, expect, test } from "vitest";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as SendouQMatch from "./SendouQMatch";

const ALPHA_ID = 1;
const BRAVO_ID = 2;

function matchWith(winners: Array<number | null>) {
	return {
		groupAlpha: { id: ALPHA_ID },
		groupBravo: { id: BRAVO_ID },
		mapList: winners.map((winnerGroupId) => ({ winnerGroupId })),
	};
}

describe("SendouQMatch.score()", () => {
	test("no maps reported yet", () => {
		const result = SendouQMatch.score(
			matchWith([null, null, null, null, null, null, null]),
		);

		expect(result.alphaWins).toBe(0);
		expect(result.bravoWins).toBe(0);
		expect(result.isDecisive).toBe(false);
	});

	test("ongoing, no side has enough wins", () => {
		const result = SendouQMatch.score(
			matchWith([ALPHA_ID, BRAVO_ID, ALPHA_ID, null, null, null, null]),
		);

		expect(result.alphaWins).toBe(2);
		expect(result.bravoWins).toBe(1);
		expect(result.isDecisive).toBe(false);
	});

	test("decisive when a side reaches mapsToWin", () => {
		const result = SendouQMatch.score(
			matchWith([ALPHA_ID, ALPHA_ID, ALPHA_ID, ALPHA_ID, null, null, null]),
		);

		expect(result.alphaWins).toBe(result.mapsToWin);
		expect(result.isDecisive).toBe(true);
	});
});

describe("SendouQMatch.currentGameNumber()", () => {
	const A = ALPHA_ID;
	const B = BRAVO_ID;

	test.each([
		{
			why: "no maps reported",
			winners: [null, null, null, null, null, null, null],
			expected: 1,
		},
		{
			why: "first map reported",
			winners: [A, null, null, null, null, null, null],
			expected: 2,
		},
		{
			why: "set-ending map awaiting confirmation",
			winners: [A, A, A, A, null, null, null],
			expected: 4,
		},
		{
			why: "decided on the last map",
			winners: [A, B, A, B, A, B, A],
			expected: 7,
		},
	])("$why", ({ winners, expected }) => {
		expect(SendouQMatch.currentGameNumber(matchWith(winners))).toBe(expected);
	});
});

describe("SendouQMatch.canSeeFriendCodes()", () => {
	const recent = dateToDatabaseTimestamp(subDays(new Date(), 1));
	const old = dateToDatabaseTimestamp(subMonths(new Date(), 2));

	test.each([
		{
			why: "participant, recent",
			createdAt: recent,
			isParticipant: true,
			isStaff: false,
			expected: true,
		},
		{
			why: "participant, old",
			createdAt: old,
			isParticipant: true,
			isStaff: false,
			expected: false,
		},
		{
			why: "staff, old",
			createdAt: old,
			isParticipant: false,
			isStaff: true,
			expected: true,
		},
		{
			why: "outsider, recent",
			createdAt: recent,
			isParticipant: false,
			isStaff: false,
			expected: false,
		},
	])("$why", ({ createdAt, isParticipant, isStaff, expected }) => {
		expect(
			SendouQMatch.canSeeFriendCodes({
				matchCreatedAt: createdAt,
				isParticipant,
				isStaff,
			}),
		).toBe(expected);
	});
});
