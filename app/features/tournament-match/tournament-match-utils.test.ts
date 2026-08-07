import { describe, expect, it, test } from "vitest";
import type { IngestedScoreboardPlayer } from "~/features/scanner-ingest/core/Scoreboards";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	mapCountPlayedInSetWithCertainty,
	resolveTimelineWeapons,
} from "./tournament-match-utils";

const mapCountParamsToResult: {
	bestOf: number;
	scores: [number, number];
	expected: number;
}[] = [
	{ bestOf: 3, scores: [0, 0], expected: 2 },
	{ bestOf: 3, scores: [1, 0], expected: 2 },
	{ bestOf: 3, scores: [1, 1], expected: 3 },
	{ bestOf: 5, scores: [0, 0], expected: 3 },
	{ bestOf: 5, scores: [1, 0], expected: 3 },
	{ bestOf: 5, scores: [2, 0], expected: 3 },
	{ bestOf: 5, scores: [2, 1], expected: 4 },
	{ bestOf: 7, scores: [0, 0], expected: 4 },
	{ bestOf: 7, scores: [2, 2], expected: 6 },
];

describe("mapCountPlayedInSetWithCertainty()", () => {
	for (const { bestOf, scores, expected } of mapCountParamsToResult) {
		test(`bestOf=${bestOf}, scores=${scores.join(",")} -> ${expected}`, () => {
			expect(mapCountPlayedInSetWithCertainty({ bestOf, scores })).toBe(
				expected,
			);
		});
	}
});

const TEAM_ID = 1;
const OTHER_TEAM_ID = 2;

function ingestedPlayer(
	partial: Partial<IngestedScoreboardPlayer>,
): IngestedScoreboardPlayer {
	return {
		name: "player",
		tournamentTeamId: TEAM_ID,
		weaponSplId: 10 as MainWeaponId,
		ka: 10,
		d: 5,
		s: 2,
		paint: 1000,
		...partial,
	};
}

describe("resolveTimelineWeapons()", () => {
	it("passes reported weapons through and leaves gaps null without ingested rows", () => {
		expect(
			resolveTimelineWeapons({
				linkedWeapons: [10, null, 20, null],
				ingestedPlayers: [],
				tournamentTeamId: TEAM_ID,
			}),
		).toEqual([10, null, 20, null]);
	});

	it("fills gaps from unaccounted ingested rows, marked unverified", () => {
		expect(
			resolveTimelineWeapons({
				linkedWeapons: [10, null, null, null],
				ingestedPlayers: [
					ingestedPlayer({ weaponSplId: 30 }),
					ingestedPlayer({ weaponSplId: 40 }),
				],
				tournamentTeamId: TEAM_ID,
			}),
		).toEqual([
			10,
			{ weaponSplId: 30, unverified: true },
			{ weaponSplId: 40, unverified: true },
			null,
		]);
	});

	it("does not reuse an ingested row whose weapon a roster member already reported", () => {
		expect(
			resolveTimelineWeapons({
				linkedWeapons: [10, null, null, null],
				ingestedPlayers: [ingestedPlayer({ weaponSplId: 10 })],
				tournamentTeamId: TEAM_ID,
			}),
		).toEqual([10, null, null, null]);
	});

	it("keeps the extra ingested row of a weapon two players ran when only one reported it", () => {
		expect(
			resolveTimelineWeapons({
				linkedWeapons: [10, null, null, null],
				ingestedPlayers: [
					ingestedPlayer({ weaponSplId: 10 }),
					ingestedPlayer({ weaponSplId: 10 }),
				],
				tournamentTeamId: TEAM_ID,
			}),
		).toEqual([10, { weaponSplId: 10, unverified: true }, null, null]);
	});

	it("skips ingested rows already attributed to a user, from the other team or without a weapon", () => {
		expect(
			resolveTimelineWeapons({
				linkedWeapons: [null, null, null, null],
				ingestedPlayers: [
					ingestedPlayer({ weaponSplId: 30, userId: 42 }),
					ingestedPlayer({
						weaponSplId: 40,
						tournamentTeamId: OTHER_TEAM_ID,
					}),
					ingestedPlayer({ weaponSplId: null }),
				],
				tournamentTeamId: TEAM_ID,
			}),
		).toEqual([null, null, null, null]);
	});
});
