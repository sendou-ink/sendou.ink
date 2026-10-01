import type { Kysely } from "kysely";

const WEAPON_IDS_BY_CATEGORY: Record<string, number[]> = {
	shooters: [
		0, 1, 10, 11, 20, 21, 22, 30, 31, 32, 40, 41, 42, 45, 46, 47, 48, 50, 51,
		60, 61, 70, 71, 72, 80, 81, 82, 90, 91, 92, 100, 101, 300, 301, 302, 310,
		311, 312, 400, 401,
	],
	blasters: [
		200, 201, 205, 210, 211, 212, 220, 221, 230, 231, 240, 241, 250, 251, 252,
		260, 261,
	],
	rollers: [
		1000, 1001, 1002, 1010, 1011, 1015, 1020, 1021, 1022, 1030, 1031, 1040,
		1041, 1042,
	],
	brushes: [1100, 1101, 1110, 1111, 1112, 1115, 1120, 1121, 1122],
	chargers: [
		2000, 2001, 2010, 2011, 2012, 2015, 2020, 2021, 2022, 2030, 2031, 2040,
		2041, 2050, 2051, 2060, 2061, 2070, 2071,
	],
	sloshers: [
		3000, 3001, 3005, 3010, 3011, 3012, 3020, 3021, 3030, 3031, 3040, 3041,
		3050, 3051, 3052,
	],
	splatlings: [
		4000, 4001, 4002, 4010, 4011, 4015, 4020, 4021, 4022, 4030, 4031, 4040,
		4041, 4050, 4051,
	],
	dualies: [
		5000, 5001, 5002, 5010, 5015, 5011, 5012, 5020, 5021, 5030, 5031, 5032,
		5040, 5041, 5050, 5051,
	],
	brellas: [6000, 6001, 6005, 6010, 6011, 6012, 6020, 6021, 6022, 6030, 6031],
	stringers: [7010, 7011, 7012, 7015, 7020, 7021, 7022, 7030, 7031],
	splatanas: [8000, 8001, 8002, 8005, 8010, 8011, 8012, 8020, 8021],
};

const MILESTONES_DESC = [4000, 3500, 3200, 3000];
const OWNER_INSERT_BATCH_SIZE = 1000;

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		const placeholderIds = (
			await trx
				.selectFrom("Trophy")
				.select("id")
				.where("code", "like", "xp-%")
				.execute()
		).map((row) => row.id);

		if (placeholderIds.length > 0) {
			await trx
				.deleteFrom("SpecialTrophyOwner")
				.where("trophyId", "in", placeholderIds)
				.execute();
			await trx
				.deleteFrom("Trophy")
				.where("id", "in", placeholderIds)
				.execute();
		}

		const trophies = await trx
			.insertInto("Trophy")
			.values(
				Object.keys(WEAPON_IDS_BY_CATEGORY).flatMap((category) =>
					MILESTONES_DESC.toReversed().map((milestone) => ({
						name: `${milestone} X Power ${category.charAt(0).toUpperCase()}${category.slice(1)}`,
						model: "",
						code: `xp-${category}-${milestone}`,
					})),
				),
			)
			.returning(["id", "code"])
			.execute();
		const trophyIdByCode = new Map(
			trophies.map((trophy) => [trophy.code, trophy.id]),
		);

		const categoryByWeaponId = new Map(
			Object.entries(WEAPON_IDS_BY_CATEGORY).flatMap(([category, weaponIds]) =>
				weaponIds.map((weaponId) => [weaponId, category] as const),
			),
		);

		const peaks = await trx
			.selectFrom("XRankPlacement")
			.innerJoin(
				"SplatoonPlayer",
				"SplatoonPlayer.id",
				"XRankPlacement.playerId",
			)
			.select(({ fn }) => [
				"SplatoonPlayer.userId",
				"XRankPlacement.weaponSplId",
				fn.max("XRankPlacement.power").as("power"),
			])
			.where("SplatoonPlayer.userId", "is not", null)
			.groupBy(["SplatoonPlayer.userId", "XRankPlacement.weaponSplId"])
			.execute();

		const peakByUserCategory = new Map<
			string,
			{ userId: number; category: string; power: number }
		>();
		for (const { userId, weaponSplId, power } of peaks) {
			const category = categoryByWeaponId.get(weaponSplId);
			if (!category) continue;

			const key = `${userId}-${category}`;
			const existing = peakByUserCategory.get(key);
			if (!existing || power > existing.power) {
				peakByUserCategory.set(key, { userId, category, power });
			}
		}

		const createdAt = Math.floor(Date.now() / 1000);
		const owners = [...peakByUserCategory.values()].flatMap(
			({ userId, category, power }) => {
				const milestone = MILESTONES_DESC.find((value) => power >= value);
				if (!milestone) return [];

				const trophyId = trophyIdByCode.get(`xp-${category}-${milestone}`);
				return trophyId ? [{ trophyId, userId, createdAt }] : [];
			},
		);

		for (let i = 0; i < owners.length; i += OWNER_INSERT_BATCH_SIZE) {
			await trx
				.insertInto("SpecialTrophyOwner")
				.values(owners.slice(i, i + OWNER_INSERT_BATCH_SIZE))
				.execute();
		}
	});
}
