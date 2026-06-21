import { describe, expect, it } from "vitest";
import { inGameNameIsValid } from "./in-game-name";

describe("inGameNameIsValid", () => {
	it("should pass valid in-game names", () => {
		const validNames = [
			"Sendou#12345",
			"The Player#12345",
			"         a#1234",
			"A#1234",
			"Player#abcd",
			"Café#1234",
			"Ελλαδα#1234",
			"テストab#1234",
			"★Test★#1234",
			"½#1234",
			"naïve#1234",
			"「テスト」#1234",
			"あ、い。#1234",
			"テスト〜#1234",
			"ロー・ル#1234",
		];

		for (const name of validNames) {
			expect(inGameNameIsValid(name), `expected "${name}" to pass`).toBe(true);
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
			expect(inGameNameIsValid(name), `expected "${name}" to fail`).toBe(false);
		}
	});

	it("should reject characters the Switch keyboard does not allow in names", () => {
		const invalidNames = [
			"test@me#1234",
			"100%#1234",
			"a\\b#1234",
			"●#1234",
			"♥#1234",
		];

		for (const name of invalidNames) {
			expect(inGameNameIsValid(name), `expected "${name}" to fail`).toBe(false);
		}
	});
});
