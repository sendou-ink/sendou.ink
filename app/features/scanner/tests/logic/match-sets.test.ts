import assert from "node:assert/strict";
import { assignMatchSets } from "../../core/match-sets";
import type {
	ScannerMatch,
	ScannerMatchPlayer,
} from "../../core/scanner-match";
import test from "../node-test-compat";

const TEAM_A = ["Sendou", "Kiver", "Brian", "Zed"];
const TEAM_B = ["Gos", "Noah", "Alice", "Bob"];
const TEAM_C = ["Totoro", "Miso", "Ramen", "Udon"];
const TEAM_D = ["Pearl", "Marina", "Callie", "Marie"];

function player(name: string | null): ScannerMatchPlayer {
	return { name, weaponId: null, paint: null, ka: null, d: null, s: null };
}

function match(
	alpha: (string | null)[],
	bravo: (string | null)[],
): ScannerMatch {
	return {
		startsAt: null,
		endsAt: null,
		playedAt: null,
		lobby: null,
		mode: null,
		stage: null,
		matchScores: null,
		replayCode: null,
		cast: false,
		objective: null,
		playerStatus: null,
		teams: [{ players: alpha.map(player) }, { players: bravo.map(player) }],
		winner: null,
		pov: null,
	};
}

test("assignMatchSets", async (t) => {
	await t.test("empty input", () => {
		assert.deepEqual(assignMatchSets([]), []);
	});

	await t.test("same eight players stay in one set", () => {
		const games = [
			match(TEAM_A, TEAM_B),
			match(TEAM_A, TEAM_B),
			match(TEAM_A, TEAM_B),
		];
		assert.deepEqual(assignMatchSets(games), [1, 1, 1]);
	});

	await t.test("team sides swapping keeps the set together", () => {
		const games = [match(TEAM_A, TEAM_B), match(TEAM_B, TEAM_A)];
		assert.deepEqual(assignMatchSets(games), [1, 1]);
	});

	await t.test("a fully different lobby opens a new set", () => {
		const games = [
			match(TEAM_A, TEAM_B),
			match(TEAM_A, TEAM_B),
			match(TEAM_C, TEAM_D),
			match(TEAM_C, TEAM_D),
		];
		assert.deepEqual(assignMatchSets(games), [1, 1, 2, 2]);
	});

	await t.test("OCR stutter on a couple of names is tolerated", () => {
		const games = [
			match(TEAM_A, TEAM_B),
			match(
				["Send0u", "Kiver", "Brian", "Zed"],
				["Gos", "N0ah", "Alice", "Bob"],
			),
		];
		assert.deepEqual(assignMatchSets(games), [1, 1]);
	});

	await t.test("tail damage on short CJK names is not a roster change", () => {
		const games = [
			match(
				["まどろみ", "ほった", "きのちゃんねる !", "くてんちゃんねる"],
				["かなえる", "たん", "ロット", "れた"],
			),
			match(
				["まどろみ", "ほっ′`", "きのちゃんねる !", "くてんちゃんねる"],
				["かなえる", "たん", "ロット", "れ"],
			),
		];
		assert.deepEqual(assignMatchSets(games), [1, 1]);
	});

	await t.test("one sub is tolerated, two are a new set", () => {
		const oneSub = [
			match(TEAM_A, TEAM_B),
			match(["Sendou", "Kiver", "Brian", "NewGuy"], TEAM_B),
		];
		assert.deepEqual(assignMatchSets(oneSub), [1, 1]);

		const twoSubs = [
			match(TEAM_A, TEAM_B),
			match(["Sendou", "Kiver", "Sub1", "Sub2"], TEAM_B),
		];
		assert.deepEqual(assignMatchSets(twoSubs), [1, 2]);
	});

	await t.test("a nameless match never breaks the chain", () => {
		const games = [
			match(TEAM_A, TEAM_B),
			match([null, null, null, null], [null, null, null, null]),
			match(TEAM_A, TEAM_B),
		];
		assert.deepEqual(assignMatchSets(games), [1, 1, 1]);
	});

	await t.test("a partial roster read chains on what both saw", () => {
		const games = [
			match(TEAM_A, TEAM_B),
			match(["Sendou", "Kiver", null, null], [null, null, null, null]),
			match(TEAM_A, TEAM_B),
		];
		assert.deepEqual(assignMatchSets(games), [1, 1, 1]);
	});

	await t.test("a partial read of different players opens a new set", () => {
		const games = [
			match(TEAM_A, TEAM_B),
			match(["Totoro", "Miso", "Ramen", null], [null, null, null, null]),
		];
		assert.deepEqual(assignMatchSets(games), [1, 2]);
	});

	await t.test("comparison follows the latest roster, not the first", () => {
		const games = [
			match(TEAM_A, TEAM_B),
			match(["Sendou", "Kiver", "Brian", "SubA"], TEAM_B),
			match(["Sendou", "Kiver", "Brian", "SubB"], TEAM_B),
		];
		assert.deepEqual(assignMatchSets(games), [1, 1, 1]);
	});
});
