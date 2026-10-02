import { sql } from "kysely";
import { crud } from "~/db/crud";
import { defineQuery, refine, sortedBy, unchanged } from "~/db/entity-query";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import type { PeakXP } from "~/db/tables-json";

const placementTable = crud("XRankPlacement");
const playerTable = crud("SplatoonPlayer");

const { delete: deletePlacements } = placementTable;

export { deletePlacements as delete };

export const { findById: findPlayerById, exists: playerExists } = playerTable;
export const { findManyBy: findTenStarWeaponsBy } = crud("TenStarWeapon");

type XRankDivision = "both" | "tentatek" | "takoroka";

export type XRankPlacementInsertArgs = Omit<
	Tables["XRankPlacement"],
	"id" | "playerId"
> & {
	/** In-game id of the player the placement belongs to. */
	playerSplId: string;
};

/** Inserts placements, creating unclaimed `SplatoonPlayer` rows for new in-game ids. Returns ids in insertion order. */
export function insertMany(newPlacements: XRankPlacementInsertArgs[]) {
	return db.transaction().execute(async (trx) => {
		const ids: number[] = [];

		for (const { playerSplId, ...placement } of newPlacements) {
			const player = await playerTable.upsert(
				{ splId: playerSplId },
				{ conflict: ["splId"], update: [] },
				trx,
			);

			const inserted = await placementTable.insert(
				{ ...placement, playerId: player.id },
				trx,
			);

			ids.push(inserted.id);
		}

		return ids;
	});
}

/** Clears the user's claim on their in-game player. */
export function unlinkPlayerByUserId(userId: number) {
	return playerTable.update({ userId }, { userId: null });
}

/** X Rank Top 500 placements, best rank first. */
export const placements = defineQuery({
	root: "XRankPlacement",
	select: (qb) =>
		qb.select([
			"XRankPlacement.id",
			"XRankPlacement.weaponSplId",
			"XRankPlacement.name",
			"XRankPlacement.power",
			"XRankPlacement.rank",
			"XRankPlacement.month",
			"XRankPlacement.year",
			"XRankPlacement.region",
			"XRankPlacement.playerId",
			"XRankPlacement.mode",
		]),
	defaultSort: [["XRankPlacement.rank", "asc"]],
	vocabulary: () => ({
		/** Placements of the in-game player the user has claimed. */
		claimedBy: (userId: number) =>
			refine("XRankPlacement", (qb) =>
				qb.where("XRankPlacement.playerId", "=", (eb) =>
					eb
						.selectFrom("SplatoonPlayer")
						.select("SplatoonPlayer.id")
						.where("SplatoonPlayer.userId", "=", userId),
				),
			),
		/** Placements of the division's leaderboard, every placement for `both`. */
		inDivision: (division: XRankDivision) =>
			division === "both"
				? unchanged("XRankPlacement")
				: refine("XRankPlacement", (qb) =>
						qb.where(
							"XRankPlacement.region",
							"=",
							division === "tentatek" ? "WEST" : "JPN",
						),
					),
		newestFirst: () =>
			sortedBy(
				"XRankPlacement",
				["XRankPlacement.year", "desc"],
				["XRankPlacement.month", "desc"],
			),
		bestRankFirst: () =>
			sortedBy("XRankPlacement", ["XRankPlacement.rank", "asc"]),
		highestPowerFirst: () =>
			sortedBy("XRankPlacement", ["XRankPlacement.power", "desc"]),
	}),
});

/** In-game players placements are recorded under, claimed by at most one user. */
export const players = defineQuery({
	root: "SplatoonPlayer",
	select: (qb) => qb.select("SplatoonPlayer.id"),
});

/** Every month with placements, newest first. */
export async function findAllMonthYears() {
	return await db
		.selectFrom("XRankPlacement")
		.select(["XRankPlacement.month", "XRankPlacement.year"])
		.distinct()
		.orderBy("XRankPlacement.year", "desc")
		.orderBy("XRankPlacement.month", "desc")
		.execute();
}

export async function refreshAllPeakXp() {
	await db
		.updateTable("SplatoonPlayer")
		.set({
			// denormalized PeakXP json: overall + per-division peaks (WEST = Tentatek, else Takoroka)
			peakXp: sql<PeakXP | null>`(
				select iif(
					max("XRankPlacement"."power") is null,
					null,
					json_object(
						'overall', max("XRankPlacement"."power"),
						'tentatek', max(iif("XRankPlacement"."region" = 'WEST', "XRankPlacement"."power", null)),
						'takoroka', max(iif("XRankPlacement"."region" != 'WEST', "XRankPlacement"."power", null))
					)
				)
				from "XRankPlacement"
				where "XRankPlacement"."playerId" = "SplatoonPlayer"."id"
			)`,
		})
		.execute();
}

const MIN_RANK_WEST = 100;

export async function refreshTenStarWeapons(userId?: number) {
	await db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("TenStarWeapon")
			.$if(userId !== undefined, (qb) => qb.where("userId", "=", userId!))
			.execute();

		await trx
			.insertInto("TenStarWeapon")
			.columns(["userId", "weaponSplId"])
			.expression(
				trx
					.selectFrom("XRankPlacement")
					.innerJoin(
						"SplatoonPlayer",
						"XRankPlacement.playerId",
						"SplatoonPlayer.id",
					)
					.select([
						sql<number>`"SplatoonPlayer"."userId"`.as("userId"),
						"XRankPlacement.weaponSplId",
					])
					.distinct()
					.where("SplatoonPlayer.userId", "is not", null)
					.$if(userId !== undefined, (qb) =>
						qb.where("SplatoonPlayer.userId", "=", userId!),
					)
					.where((eb) =>
						eb.or([
							eb("XRankPlacement.region", "=", "JPN"),
							eb.and([
								eb("XRankPlacement.region", "=", "WEST"),
								eb("XRankPlacement.rank", "<=", MIN_RANK_WEST),
							]),
						]),
					),
			)
			.execute();
	});
}
