import { describe, expect, test } from "bun:test";
import { subDays, subMonths } from "date-fns";
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
