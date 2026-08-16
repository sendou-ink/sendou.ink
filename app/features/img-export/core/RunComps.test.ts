import { describe, expect, test } from "vitest";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import * as RunComps from "./RunComps";

const SHOOTER = 40 as MainWeaponId;
const ROLLER = 1010 as MainWeaponId;
const CHARGER = 2010 as MainWeaponId;
/** a kit that runs Tacticooler as the special */
const TACTICOOLER_WEAPON = 60 as MainWeaponId;

const observation = (
	playerKey: string,
	weaponSplId: MainWeaponId,
	mapOrder: number,
): RunComps.CompObservation => ({ playerKey, weaponSplId, mapOrder });

describe("buildComp", () => {
	test("returns an empty comp for no observations", () => {
		expect(RunComps.buildComp([])).toEqual([]);
	});

	test("picks each player's most played weapon", () => {
		expect(
			RunComps.buildComp([
				observation("a", SHOOTER, 0),
				observation("a", SHOOTER, 1),
				observation("a", CHARGER, 2),
			]),
		).toEqual([SHOOTER]);
	});

	test("breaks a most played tie by the most recently played weapon", () => {
		expect(
			RunComps.buildComp([
				observation("a", CHARGER, 0),
				observation("a", SHOOTER, 1),
			]),
		).toEqual([SHOOTER]);
	});

	test("sorts the comp by weapon id with Tacticooler weapons last", () => {
		expect(
			RunComps.buildComp([
				observation("a", ROLLER, 0),
				observation("b", TACTICOOLER_WEAPON, 0),
				observation("c", SHOOTER, 0),
			]),
		).toEqual([SHOOTER, ROLLER, TACTICOOLER_WEAPON]);
	});

	test("keeps the players that played the most maps when there are more than four", () => {
		const fullSet = (playerKey: string, weaponSplId: MainWeaponId) => [
			observation(playerKey, weaponSplId, 0),
			observation(playerKey, weaponSplId, 1),
		];

		expect(
			RunComps.buildComp([
				...fullSet("a", SHOOTER),
				...fullSet("b", ROLLER),
				...fullSet("c", CHARGER),
				...fullSet("d", TACTICOOLER_WEAPON),
				observation("sub", 5010 as MainWeaponId, 1),
			]),
		).toEqual([SHOOTER, ROLLER, CHARGER, TACTICOOLER_WEAPON]);
	});
});

describe("mapObservations", () => {
	test("keeps reported weapons and ingested rows of other players", () => {
		expect(
			RunComps.mapObservations({
				mapOrder: 3,
				reported: [{ userId: 1, weaponSplId: SHOOTER }],
				ingested: [{ name: "opponent", weaponSplId: ROLLER }],
			}),
		).toEqual([
			observation("user-1", SHOOTER, 3),
			observation("name-opponent", ROLLER, 3),
		]);
	});

	test("drops an ingested row linked to a user that already reported", () => {
		expect(
			RunComps.mapObservations({
				mapOrder: 0,
				reported: [{ userId: 1, weaponSplId: SHOOTER }],
				ingested: [{ name: "player", userId: 1, weaponSplId: ROLLER }],
			}),
		).toEqual([observation("user-1", SHOOTER, 0)]);
	});

	test("drops an unlinked ingested row whose weapon a report accounts for, counting duplicates as a multiset", () => {
		expect(
			RunComps.mapObservations({
				mapOrder: 0,
				reported: [{ userId: 1, weaponSplId: SHOOTER }],
				ingested: [
					{ name: "one", weaponSplId: SHOOTER },
					{ name: "two", weaponSplId: SHOOTER },
				],
			}),
		).toEqual([
			observation("user-1", SHOOTER, 0),
			observation("name-two", SHOOTER, 0),
		]);
	});

	test("skips ingested rows without a weapon", () => {
		expect(
			RunComps.mapObservations({
				mapOrder: 0,
				reported: [],
				ingested: [{ name: "unknown", weaponSplId: null }],
			}),
		).toEqual([]);
	});
});
