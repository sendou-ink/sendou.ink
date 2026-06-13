import { describe, expect, test } from "vitest";
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
