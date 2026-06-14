import { describe, expect, it } from "vitest";
import { IN_GAME_NAME_REGEXP } from "./user-page-constants";

describe("IN_GAME_NAME_REGEXP", () => {
	it("should pass valid in-game names", () => {
		const validNames = [
			"Sendou#12345",
			"The Player#12345",
			"         a#1234",
			"A#1234",
			"Player#abcd",
			"テストabc#1234",
			"☆CR☆Sheep!#1234",
			"Café#1234",
			"Ελλαδα#1234",
		];

		for (const name of validNames) {
			expect(IN_GAME_NAME_REGEXP.test(name), `expected "${name}" to pass`).toBe(
				true,
			);
		}
	});

	it("should not pass invalid in-game names", () => {
		const invalidNames = [
			"#1234",
			"Sendou1234",
			"Sendou#123",
			"Sendou# 1234",
			"Sendou#123456",
			"Sendou#ABCD",
			"12345678901#1234",
			"𝓔𝓔𝓔𝓔𝓔𝓔𝓔𝓔𝓔𝓔𝓔#1234",
			"名前テスト1234#ab12c",
			"☆CR☆Sh𝓔𝓔p!#1234",
			"日本語#1234",
		];

		for (const name of invalidNames) {
			expect(IN_GAME_NAME_REGEXP.test(name), `expected "${name}" to fail`).toBe(
				false,
			);
		}
	});
});
