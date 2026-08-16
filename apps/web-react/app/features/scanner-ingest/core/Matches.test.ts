import { describe, expect, test } from "vitest";
import type { ScannerMatch } from "~/features/scanner/core/scanner-match";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import * as Matches from "./Matches";
import {
	NAMES,
	scannerMatch,
	scannerMatchPlayer,
	sideSwapped,
	WEAPONS,
} from "./tests/fixtures";

describe("canonicalMatch", () => {
	test("serializes identically regardless of input key order", () => {
		const match = scannerMatch({
			objective: {
				mode: "SZ",
				samples: [
					{
						t: 120,
						time: 215,
						score: [95, 53],
						penalty: [4, null],
						control: [true, false],
					},
				],
			},
		});
		const reordered = JSON.parse(
			JSON.stringify({
				winner: match.winner,
				objective: match.objective,
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
	test("recognizes an identical match", () => {
		expect(Matches.isSameMatch(scannerMatch(), scannerMatch())).toBe(true);
	});

	test("matching replay codes are a strong key", () => {
		const a = scannerMatch({
			replayCode: "RABC-DEFG-HIJK-LMNO",
			teams: scannerMatch().teams,
		});
		const b = scannerMatch({
			replayCode: "RABC-DEFG-HIJK-LMNO",
			matchScores: null,
			teams: [{ players: [] }, { players: [] }],
			winner: null,
		});
		expect(Matches.isSameMatch(a, b)).toBe(true);
	});

	test("tolerates OCR jitter in the replay code", () => {
		const a = scannerMatch({ replayCode: "RABC-DEFG-HIJK-LMNO" });
		const b = scannerMatch({ replayCode: "RA8C-DEFG-HIJK-LMN0" });
		expect(Matches.isSameMatch(a, b)).toBe(true);
	});

	test("clearly different replay codes contradict identity", () => {
		const a = scannerMatch({ replayCode: "RABC-DEFG-HIJK-LMNO" });
		const b = scannerMatch({ replayCode: "RZYX-WVUT-SRQP-ONML" });
		expect(Matches.isSameMatch(a, b)).toBe(false);
	});

	test("close play times identify a match", () => {
		const a = scannerMatch({ playedAt: 1_700_000_000_000 });
		const b = scannerMatch({
			playedAt: 1_700_000_000_000 + 5 * 60 * 1000,
			matchScores: null,
			teams: [{ players: [] }, { players: [] }],
			winner: null,
		});
		expect(Matches.isSameMatch(a, b)).toBe(true);
	});

	test("far-apart play times contradict identity even with equal rosters", () => {
		const a = scannerMatch({ playedAt: 1_700_000_000_000 });
		const b = scannerMatch({ playedAt: 1_700_000_000_000 + 60 * 60 * 1000 });
		expect(Matches.isSameMatch(a, b)).toBe(false);
	});

	test("differing modes or stages contradict identity", () => {
		expect(
			Matches.isSameMatch(
				scannerMatch({ mode: "SZ" }),
				scannerMatch({ mode: "TC" }),
			),
		).toBe(false);
		expect(
			Matches.isSameMatch(
				scannerMatch({ stage: 0 }),
				scannerMatch({ stage: 1 }),
			),
		).toBe(false);
	});

	test("a null mode does not contradict a read one", () => {
		expect(
			Matches.isSameMatch(
				scannerMatch({ mode: null }),
				scannerMatch({ mode: "TC" }),
			),
		).toBe(true);
	});

	test("roster overlap identifies a match even side-swapped", () => {
		expect(
			Matches.isSameMatch(scannerMatch(), sideSwapped(scannerMatch())),
		).toBe(true);
	});

	test("roster overlap survives a couple of misread names", () => {
		const b = scannerMatch();
		b.teams[0].players[0] = scannerMatchPlayer("misread", WEAPONS[0]!);
		b.teams[1].players[3] = scannerMatchPlayer(null, WEAPONS[7]!);
		expect(Matches.isSameMatch(scannerMatch(), b)).toBe(true);
	});

	test("weapons alone identify a match when names are unread (minimap vs scoreboard)", () => {
		const minimap = scannerMatch({
			winner: null,
			lobby: null,
			matchScores: null,
			teams: [
				{
					players: WEAPONS.slice(0, 4).map((w) => scannerMatchPlayer(null, w)),
				},
				{ players: WEAPONS.slice(4).map((w) => scannerMatchPlayer(null, w)) },
			],
		});
		expect(Matches.isSameMatch(scannerMatch(), minimap)).toBe(true);
	});

	test("unrelated matches are not the same", () => {
		const other = scannerMatch({
			matchScores: [88, 12],
			teams: [
				{
					players: ["a", "b", "c", "d"].map((n, i) =>
						scannerMatchPlayer(n, (100 + 10 * i) as MainWeaponId),
					),
				},
				{
					players: ["e", "f", "g", "h"].map((n, i) =>
						scannerMatchPlayer(n, (200 + 10 * i) as MainWeaponId),
					),
				},
			],
		});
		expect(Matches.isSameMatch(scannerMatch(), other)).toBe(false);
	});
});

describe("mergeMatches", () => {
	test("fills stored nulls and reports no change when nothing was added", () => {
		const existing = scannerMatch({ mode: null, playedAt: null });
		const incoming = scannerMatch({ mode: "SZ", playedAt: 1_700_000_000_000 });

		const first = Matches.mergeMatches(existing, incoming);
		expect(first.changed).toBe(true);
		expect(first.merged.mode).toBe("SZ");
		expect(first.merged.playedAt).toBe(1_700_000_000_000);

		const second = Matches.mergeMatches(first.merged, incoming);
		expect(second.changed).toBe(false);
	});

	test("stored values win on conflict", () => {
		const existing = scannerMatch({ stage: 0 });
		const incoming = scannerMatch({ stage: null });
		incoming.teams[0].players[0] = scannerMatchPlayer(
			"other",
			999 as MainWeaponId,
		);

		const { merged } = Matches.mergeMatches(existing, incoming);
		expect(merged.stage).toBe(0);
		expect(merged.teams[0].players[0]!.name).toBe("w1");
	});

	test("aligns a side-swapped incoming match before merging", () => {
		const existing = scannerMatch({ winner: null, matchScores: null });
		const incoming = sideSwapped(
			scannerMatch({ matchScores: [84, 71], playedAt: 1_700_000_000_000 }),
		);

		const { merged } = Matches.mergeMatches(existing, incoming);
		expect(merged.winner).toBe(0);
		expect(merged.matchScores).toEqual([84, 71]);
		expect(merged.teams[0].players.map((p) => p.name)).toEqual(
			NAMES.slice(0, 4),
		);
	});

	test("merges player rows by name, keeping stored stats and adding missing ones", () => {
		const existing = scannerMatch();
		existing.teams[1].players[1] = scannerMatchPlayer("l2", null);
		const incoming = scannerMatch();
		incoming.teams[1].players = [
			scannerMatchPlayer("l2", WEAPONS[5]!, { ka: 12, abilities: [["ISM"]] }),
			scannerMatchPlayer("l1", WEAPONS[4]!),
			scannerMatchPlayer("l3", WEAPONS[6]!),
			scannerMatchPlayer("l4", WEAPONS[7]!),
		];

		const { merged } = Matches.mergeMatches(existing, incoming);
		const l2 = merged.teams[1].players[1]!;
		expect(l2.weaponId).toBe(WEAPONS[5]);
		expect(l2.ka).toBe(12);
		expect(l2.abilities).toEqual([["ISM"]]);
	});

	test("fills empty teams from the incoming match", () => {
		const existing = scannerMatch({
			winner: null,
			matchScores: null,
			teams: [{ players: [] }, { players: [] }],
			replayCode: "RABC-DEFG-HIJK-LMNO",
		});
		const incoming = scannerMatch({ replayCode: "RABC-DEFG-HIJK-LMNO" });

		const { merged, changed } = Matches.mergeMatches(existing, incoming);
		expect(changed).toBe(true);
		expect(merged.winner).toBe(0);
		expect(merged.teams[0].players.map((p) => p.name)).toEqual(
			NAMES.slice(0, 4),
		);
		expect(merged.matchScores).toEqual([100, 52]);
	});
});

describe("playerStatus", () => {
	const STATUS: NonNullable<ScannerMatch["playerStatus"]> = {
		samples: [
			{
				t: 60,
				time: 240,
				special: [
					[true, false, false, false],
					[false, false, false, false],
				],
				dead: [
					[false, false, false, false],
					[false, true, false, false],
				],
			},
		],
	};

	test("merges whole-series first-ingest-wins", () => {
		const filled = Matches.mergeMatches(
			scannerMatch(),
			scannerMatch({ playerStatus: STATUS }),
		);
		expect(filled.merged.playerStatus).toEqual(STATUS);
		expect(filled.changed).toBe(true);

		const kept = Matches.mergeMatches(
			scannerMatch({ playerStatus: STATUS }),
			scannerMatch({ playerStatus: { samples: [] } }),
		);
		expect(kept.merged.playerStatus).toEqual(STATUS);
	});

	test("side-aligning an incoming match swaps its status samples too", () => {
		const incoming = sideSwapped(scannerMatch({ playerStatus: STATUS }));
		const { merged } = Matches.mergeMatches(
			scannerMatch({ winner: null, matchScores: null, playerStatus: null }),
			incoming,
		);
		expect(merged.playerStatus!.samples[0]!.dead).toEqual([
			[false, true, false, false],
			[false, false, false, false],
		]);
		expect(merged.playerStatus!.samples[0]!.special).toEqual([
			[false, false, false, false],
			[true, false, false, false],
		]);
	});
});
