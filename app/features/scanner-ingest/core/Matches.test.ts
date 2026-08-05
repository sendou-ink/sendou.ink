import { describe, expect, it } from "vitest";
import type {
	ScannerMatch,
	ScannerMatchPlayer,
} from "~/features/scanner/core/scanner-match";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import * as Matches from "./Matches";

const NAMES = ["w1", "w2", "w3", "w4", "l1", "l2", "l3", "l4"];
const WEAPONS: MainWeaponId[] = [10, 20, 30, 40, 50, 60, 70, 80];

function player(
	name: string | null,
	weaponId: MainWeaponId | null,
	partial: Partial<ScannerMatchPlayer> = {},
): ScannerMatchPlayer {
	return {
		name,
		weaponId,
		paint: null,
		ka: null,
		d: null,
		s: null,
		...partial,
	};
}

function testMatch(partial: Partial<ScannerMatch> = {}): ScannerMatch {
	return {
		startsAt: 100,
		endsAt: 400,
		playedAt: null,
		lobby: "PRIVATE",
		mode: "SZ",
		stage: 0,
		matchScores: null,
		replayCode: null,
		cast: false,
		teams: [
			{
				score: 100,
				players: NAMES.slice(0, 4).map((n, i) => player(n, WEAPONS[i]!)),
			},
			{
				score: 52,
				players: NAMES.slice(4).map((n, i) => player(n, WEAPONS[4 + i]!)),
			},
		],
		winner: 0,
		pov: null,
		...partial,
	};
}

/** The same rosters seen from the other side (e.g. a minimap alpha/bravo view). */
function sideSwapped(match: ScannerMatch): ScannerMatch {
	return {
		...match,
		teams: [match.teams[1], match.teams[0]],
		winner: match.winner === null ? null : match.winner === 0 ? 1 : 0,
		matchScores:
			match.matchScores === null
				? null
				: [match.matchScores[1], match.matchScores[0]],
	};
}

describe("canonicalMatch", () => {
	it("serializes identically regardless of input key order", () => {
		const match = testMatch();
		const reordered = JSON.parse(
			JSON.stringify({
				winner: match.winner,
				teams: match.teams,
				cast: match.cast,
				replayCode: match.replayCode,
				matchScores: match.matchScores,
				stage: match.stage,
				mode: match.mode,
				lobby: match.lobby,
				playedAt: match.playedAt,
				endsAt: match.endsAt,
				startsAt: match.startsAt,
				pov: match.pov,
			}),
		) as ScannerMatch;

		expect(JSON.stringify(Matches.canonicalMatch(reordered))).toBe(
			JSON.stringify(Matches.canonicalMatch(match)),
		);
	});
});

describe("isSameMatch", () => {
	it("recognizes an identical match", () => {
		expect(Matches.isSameMatch(testMatch(), testMatch())).toBe(true);
	});

	it("matching replay codes are a strong key", () => {
		const a = testMatch({
			replayCode: "RABC-DEFG-HIJK-LMNO",
			teams: testMatch().teams,
		});
		const b = testMatch({
			replayCode: "RABC-DEFG-HIJK-LMNO",
			teams: [
				{ score: null, players: [] },
				{ score: null, players: [] },
			],
			winner: null,
		});
		expect(Matches.isSameMatch(a, b)).toBe(true);
	});

	it("tolerates OCR jitter in the replay code", () => {
		const a = testMatch({ replayCode: "RABC-DEFG-HIJK-LMNO" });
		const b = testMatch({ replayCode: "RA8C-DEFG-HIJK-LMN0" });
		expect(Matches.isSameMatch(a, b)).toBe(true);
	});

	it("clearly different replay codes contradict identity", () => {
		const a = testMatch({ replayCode: "RABC-DEFG-HIJK-LMNO" });
		const b = testMatch({ replayCode: "RZYX-WVUT-SRQP-ONML" });
		expect(Matches.isSameMatch(a, b)).toBe(false);
	});

	it("close play times identify a match", () => {
		const a = testMatch({ playedAt: 1_700_000_000_000 });
		const b = testMatch({
			playedAt: 1_700_000_000_000 + 5 * 60 * 1000,
			teams: [
				{ score: null, players: [] },
				{ score: null, players: [] },
			],
			winner: null,
		});
		expect(Matches.isSameMatch(a, b)).toBe(true);
	});

	it("far-apart play times contradict identity even with equal rosters", () => {
		const a = testMatch({ playedAt: 1_700_000_000_000 });
		const b = testMatch({ playedAt: 1_700_000_000_000 + 60 * 60 * 1000 });
		expect(Matches.isSameMatch(a, b)).toBe(false);
	});

	it("differing modes or stages contradict identity", () => {
		expect(
			Matches.isSameMatch(testMatch({ mode: "SZ" }), testMatch({ mode: "TC" })),
		).toBe(false);
		expect(
			Matches.isSameMatch(testMatch({ stage: 0 }), testMatch({ stage: 1 })),
		).toBe(false);
	});

	it("a null mode does not contradict a read one", () => {
		expect(
			Matches.isSameMatch(testMatch({ mode: null }), testMatch({ mode: "TC" })),
		).toBe(true);
	});

	it("roster overlap identifies a match even side-swapped", () => {
		expect(Matches.isSameMatch(testMatch(), sideSwapped(testMatch()))).toBe(
			true,
		);
	});

	it("roster overlap survives a couple of misread names", () => {
		const b = testMatch();
		b.teams[0].players[0] = player("misread", WEAPONS[0]!);
		b.teams[1].players[3] = player(null, WEAPONS[7]!);
		expect(Matches.isSameMatch(testMatch(), b)).toBe(true);
	});

	it("weapons alone identify a match when names are unread (minimap vs scoreboard)", () => {
		const minimap = testMatch({
			winner: null,
			lobby: null,
			teams: [
				{
					score: null,
					players: WEAPONS.slice(0, 4).map((w) => player(null, w)),
				},
				{
					score: null,
					players: WEAPONS.slice(4).map((w) => player(null, w)),
				},
			],
		});
		expect(Matches.isSameMatch(testMatch(), minimap)).toBe(true);
	});

	it("unrelated matches are not the same", () => {
		const other = testMatch({
			teams: [
				{
					score: 88,
					players: ["a", "b", "c", "d"].map((n, i) =>
						player(n, (100 + 10 * i) as MainWeaponId),
					),
				},
				{
					score: 12,
					players: ["e", "f", "g", "h"].map((n, i) =>
						player(n, (200 + 10 * i) as MainWeaponId),
					),
				},
			],
		});
		expect(Matches.isSameMatch(testMatch(), other)).toBe(false);
	});
});

describe("mergeMatches", () => {
	it("fills stored nulls and reports no change when nothing was added", () => {
		const existing = testMatch({ mode: null, playedAt: null });
		const incoming = testMatch({ mode: "SZ", playedAt: 1_700_000_000_000 });

		const first = Matches.mergeMatches(existing, incoming);
		expect(first.changed).toBe(true);
		expect(first.merged.mode).toBe("SZ");
		expect(first.merged.playedAt).toBe(1_700_000_000_000);

		const second = Matches.mergeMatches(first.merged, incoming);
		expect(second.changed).toBe(false);
	});

	it("stored values win on conflict", () => {
		const existing = testMatch({ stage: 0 });
		const incoming = testMatch({ stage: null });
		incoming.teams[0].players[0] = player("other", 999 as MainWeaponId);

		const { merged } = Matches.mergeMatches(existing, incoming);
		expect(merged.stage).toBe(0);
		expect(merged.teams[0].players[0]!.name).toBe("w1");
	});

	it("aligns a side-swapped incoming match before merging", () => {
		const existing = testMatch({ winner: null, matchScores: null });
		const incoming = sideSwapped(
			testMatch({ matchScores: [3, 1], playedAt: 1_700_000_000_000 }),
		);

		const { merged } = Matches.mergeMatches(existing, incoming);
		expect(merged.winner).toBe(0);
		expect(merged.matchScores).toEqual([3, 1]);
		expect(merged.teams[0].players.map((p) => p.name)).toEqual(
			NAMES.slice(0, 4),
		);
	});

	it("merges player rows by name, keeping stored stats and adding missing ones", () => {
		const existing = testMatch();
		existing.teams[1].players[1] = player("l2", null);
		const incoming = testMatch();
		incoming.teams[1].players = [
			player("l2", WEAPONS[5]!, { ka: 12, abilities: [["ISM"]] }),
			player("l1", WEAPONS[4]!),
			player("l3", WEAPONS[6]!),
			player("l4", WEAPONS[7]!),
		];

		const { merged } = Matches.mergeMatches(existing, incoming);
		const l2 = merged.teams[1].players[1]!;
		expect(l2.weaponId).toBe(WEAPONS[5]);
		expect(l2.ka).toBe(12);
		expect(l2.abilities).toEqual([["ISM"]]);
	});

	it("fills empty teams from the incoming match", () => {
		const existing = testMatch({
			winner: null,
			teams: [
				{ score: null, players: [] },
				{ score: null, players: [] },
			],
			replayCode: "RABC-DEFG-HIJK-LMNO",
		});
		const incoming = testMatch({ replayCode: "RABC-DEFG-HIJK-LMNO" });

		const { merged, changed } = Matches.mergeMatches(existing, incoming);
		expect(changed).toBe(true);
		expect(merged.winner).toBe(0);
		expect(merged.teams[0].players.map((p) => p.name)).toEqual(
			NAMES.slice(0, 4),
		);
		expect(merged.teams[0].score).toBe(100);
	});
});
