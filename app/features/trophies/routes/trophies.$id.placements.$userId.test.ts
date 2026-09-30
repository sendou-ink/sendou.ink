import { beforeEach, describe, expect, test } from "vitest";
import * as TrophyFactory from "~/db/seed/factories/TrophyFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as XRankPlacementFactory from "~/db/seed/factories/XRankPlacementFactory";
import { wrappedLoader } from "~/utils/Test";
import {
	loader,
	type TrophyPlacementsLoaderData,
} from "./trophies.$id.placements.$userId";

const SPLATTERSHOT = 40;
const SPLAT_CHARGER = 2010;

const placementsLoader = wrappedLoader<TrophyPlacementsLoaderData>({ loader });

const users = UserFactory.pool();
const playerId = () => users.id(1);

describe("X Power trophy placements", () => {
	let shootersTrophyId: number;

	beforeEach(async () => {
		await users.create(1);
		shootersTrophyId = (await TrophyFactory.createXpTrophies()).find(
			(trophy) => trophy.code === "xp-shooters-3000",
		)!.id;

		for (const [weaponSplId, power] of [
			[SPLATTERSHOT, 3050],
			[SPLAT_CHARGER, 3400],
			[SPLATTERSHOT, 3150],
		] as const) {
			await XRankPlacementFactory.create({
				playerUserId: playerId(),
				weaponSplId,
				power,
			});
		}
	});

	const load = (trophyId: number) =>
		placementsLoader({
			params: { id: String(trophyId), userId: String(playerId()) },
		});

	test("lists the placements with the trophy's weapon category, highest first", async () => {
		const { placements } = await load(shootersTrophyId);

		expect(
			placements.map((placement) => [placement.weaponSplId, placement.power]),
		).toEqual([
			[SPLATTERSHOT, 3150],
			[SPLATTERSHOT, 3050],
		]);
	});

	test("is not found for a tournament trophy", async () => {
		const trophy = await TrophyFactory.create();

		await expect(load(trophy.id)).rejects.toThrow("404");
	});
});
