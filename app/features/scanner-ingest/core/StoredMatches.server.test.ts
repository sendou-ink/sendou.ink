import { describe, expect, test } from "vitest";
import type {
	ScannerMatchObjective,
	ScannerMatchPlayerStatus,
} from "~/features/scanner/core/scanner-match";
import * as StoredMatches from "./StoredMatches.server";
import { scannerMatch } from "./tests/fixtures";

const OBJECTIVE: ScannerMatchObjective = {
	mode: "SZ",
	samples: [
		{ t: 10, time: 290, score: [90, 100], penalty: [null, null], control: 0 },
	],
};

const PLAYER_STATUS: ScannerMatchPlayerStatus = {
	samples: [
		{
			t: 10,
			time: 290,
			special: [
				[true, false, false, false],
				[false, false, false, true],
			],
			dead: [
				[false, false, false, false],
				[false, true, false, false],
			],
		},
	],
};

describe("StoredMatches.toStored", () => {
	test.each([
		{
			why: "both timelines",
			objective: OBJECTIVE,
			playerStatus: PLAYER_STATUS,
		},
		{ why: "objective only", objective: OBJECTIVE, playerStatus: null },
		{ why: "player status only", objective: null, playerStatus: PLAYER_STATUS },
		{ why: "no timelines", objective: null, playerStatus: null },
	])(
		"round-trips through fromStored with $why",
		({ objective, playerStatus }) => {
			const match = scannerMatch({ objective, playerStatus });

			const stored = StoredMatches.toStored(match);

			expect(stored.data).not.toHaveProperty("objective");
			expect(stored.data).not.toHaveProperty("playerStatus");
			expect(StoredMatches.fromStored(stored)).toEqual(match);
		},
	);

	test("stores no timelines column when neither timeline was read", () => {
		const stored = StoredMatches.toStored(scannerMatch());

		expect(stored.timelines).toBeNull();
	});
});
