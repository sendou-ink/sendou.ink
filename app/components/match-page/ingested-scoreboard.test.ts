import { describe, expect, test } from "vitest";
import type { IngestedScoreboardPlayer } from "~/features/scanner-ingest/core/Scoreboards";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { resolveTimelineWeapons } from "./ingested-scoreboard";

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
	test("passes reported weapons through and leaves gaps null without ingested rows", () => {
		expect(
			resolveTimelineWeapons({
				linkedWeapons: [10, null, 20, null],
				ingestedPlayers: [],
				tournamentTeamId: TEAM_ID,
			}),
		).toEqual([10, null, 20, null]);
	});

	test("fills gaps from unaccounted ingested rows, marked unverified", () => {
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

	test("does not reuse an ingested row whose weapon a roster member already reported", () => {
		expect(
			resolveTimelineWeapons({
				linkedWeapons: [10, null, null, null],
				ingestedPlayers: [ingestedPlayer({ weaponSplId: 10 })],
				tournamentTeamId: TEAM_ID,
			}),
		).toEqual([10, null, null, null]);
	});

	test("keeps the extra ingested row of a weapon two players ran when only one reported it", () => {
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

	test("skips ingested rows already attributed to a user, from the other team or without a weapon", () => {
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
