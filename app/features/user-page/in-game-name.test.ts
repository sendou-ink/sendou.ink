import { describe, expect, test } from "vitest";
import { inGameNameIsValid, sanitizeInGameName } from "./in-game-name";

describe("inGameNameIsValid", () => {
	test("passes valid in-game names", () => {
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
			"こゝろ#1234",
			"すゞ#1234",
			"ヽヾ#1234",
			"【Foo】#1234",
			"〈Foo〉#1234",
			"《Foo》#1234",
			"『Foo』#1234",
			"〔Foo〕#1234",
			"こ々ろ#1234",
			"〆〇〃#1234",
			"※Test#1234",
			"○☆Mikurby#2897",
			"仝#1234",
			"三#1234",
			"日本語#1234",
			"名前テスト1234#ab12c",
			"한국어#1234",
			"中文名#1234",
			"Ｔｅｓｔ！#1234",
			"Cafe\u0301#1234",
		];

		for (const name of validNames) {
			expect(inGameNameIsValid(name), `expected "${name}" to pass`).toBe(true);
		}
	});

	test("does not pass invalid in-game names", () => {
		const invalidNames = [
			"#1234",
			"Sendou1234",
			"Sendou#123",
			"Sendou# 1234",
			"Sendou#123456",
			"Sendou#ABCD",
			"12345678901#1234",
			"𝓔𝓔𝓔𝓔𝓔𝓔𝓔𝓔𝓔𝓔𝓔#1234",
			"☆CR☆Sh𝓔𝓔p!#1234",
		];

		for (const name of invalidNames) {
			expect(inGameNameIsValid(name), `expected "${name}" to fail`).toBe(false);
		}
	});

	test("rejects characters the Switch keyboard does not allow in names", () => {
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

describe("sanitizeInGameName", () => {
	test.each([
		["仝#1234", "仝#1234", "kanji outside the character picker"],
		["三三三#1234", "三三三#1234", "pasted kanji"],
		["한국어#1234", "한국어#1234", "hangul"],
		["Cafe\u0301#1234", "Café#1234", "decomposed accents are composed"],
		["100%#1234", "100#1234", "characters the game does not allow"],
	])("%s -> %s (%s)", (input, expected) => {
		expect(sanitizeInGameName(input)).toBe(expected);
	});
});
