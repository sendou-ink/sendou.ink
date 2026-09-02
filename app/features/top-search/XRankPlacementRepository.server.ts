import type { InferResult } from "kysely";
import { sql } from "kysely";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { peakXpOverallSql } from "~/utils/kysely.server";

export type XRankPlacementInsertArgs = Omit<
	Tables["XRankPlacement"],
	"id" | "playerId"
> & {
	/** In-game id of the player the placement belongs to. */
	playerSplId: string;
	/** For sources that already know the pairing; claiming later goes through `AdminRepository.linkUserAndPlayer`. */
	playerUserId?: number;
};

/** Inserts placements, creating `SplatoonPlayer` rows for new in-game ids. Returns ids in insertion order. */
export function insertMany(placements: XRankPlacementInsertArgs[]) {
	return db.transaction().execute(async (trx) => {
		const ids: number[] = [];

		for (const { playerSplId, playerUserId, ...placement } of placements) {
			await trx
				.insertInto("SplatoonPlayer")
				.values({ splId: playerSplId, userId: playerUserId ?? null })
				.onConflict((oc) =>
					playerUserId
						? oc.column("splId").doUpdateSet({ userId: playerUserId })
						: oc.column("splId").doNothing(),
				)
				.execute();

			const inserted = await trx
				.insertInto("XRankPlacement")
				.values({
					...placement,
					playerId: (eb) =>
						eb
							.selectFrom("SplatoonPlayer")
							.select("SplatoonPlayer.id")
							.where("splId", "=", playerSplId),
				})
				.returning("id")
				.executeTakeFirstOrThrow();

			ids.push(inserted.id);
		}

		return ids;
	});
}

/** Removes every placement of the given month. */
export function deleteAllByMonthYear(
	args: Pick<Tables["XRankPlacement"], "month" | "year">,
) {
	return db
		.deleteFrom("XRankPlacement")
		.where("month", "=", args.month)
		.where("year", "=", args.year)
		.execute();
}

export function unlinkPlayerByUserId(userId: number) {
	return db
		.updateTable("SplatoonPlayer")
		.set({ userId: null })
		.where("SplatoonPlayer.userId", "=", userId)
		.execute();
}

/** Whether the user has a linked Splatoon player (i.e. has claimed their X Rank results). */
export async function isPlayerLinkedByUserId(userId: number): Promise<boolean> {
	const player = await db
		.selectFrom("SplatoonPlayer")
		.select("SplatoonPlayer.id")
		.where("SplatoonPlayer.userId", "=", userId)
		.executeTakeFirst();

	return Boolean(player);
}

/** From the linked player's denormalized `SplatoonPlayer.peakXp` (see {@link refreshAllPeakXp}); `null` without one. */
export async function findPeakVerifiedXpByUserId(
	userId: Tables["User"]["id"],
): Promise<number | null> {
	const row = await db
		.selectFrom("SplatoonPlayer")
		.where("SplatoonPlayer.userId", "=", userId)
		.select(peakXpOverallSql().as("overall"))
		.executeTakeFirst();

	return row?.overall ?? null;
}

function xRankPlacementsQueryBase() {
	return db
		.selectFrom("XRankPlacement")
		.select([
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
		])
		.innerJoin("SplatoonPlayer", "XRankPlacement.playerId", "SplatoonPlayer.id")
		.leftJoin("User", "SplatoonPlayer.userId", "User.id")
		.select(["User.discordId", "User.customUrl"]);
}

export async function findPlacementsOfMonth(
	args: Pick<Tables["XRankPlacement"], "mode" | "region" | "month" | "year">,
) {
	return await xRankPlacementsQueryBase()
		.where("XRankPlacement.mode", "=", args.mode)
		.where("XRankPlacement.region", "=", args.region)
		.where("XRankPlacement.month", "=", args.month)
		.where("XRankPlacement.year", "=", args.year)
		.orderBy("XRankPlacement.rank", "asc")
		.execute();
}

export async function findPlacementsByPlayerId(
	playerId: Tables["XRankPlacement"]["playerId"],
) {
	const result = await xRankPlacementsQueryBase()
		.where("XRankPlacement.playerId", "=", playerId)
		.orderBy("XRankPlacement.year", "desc")
		.orderBy("XRankPlacement.month", "desc")
		.orderBy("XRankPlacement.rank", "asc")
		.execute();
	return result.length ? result : null;
}

export async function findPlacementsByUserId(
	userId: Tables["User"]["id"],
	options?: { limit?: number; weaponId?: MainWeaponId },
) {
	let query = xRankPlacementsQueryBase()
		.where("SplatoonPlayer.userId", "=", userId)
		.orderBy("XRankPlacement.power", "desc");

	if (typeof options?.weaponId === "number") {
		query = query.where("XRankPlacement.weaponSplId", "=", options.weaponId);
	}

	if (options?.limit) {
		query = query.limit(options.limit);
	}

	const result = await query.execute();
	return result.length ? result : null;
}

export async function findAllMonthYears() {
	return await db
		.selectFrom("XRankPlacement")
		.select(["month", "year"])
		.distinct()
		.orderBy("year", "desc")
		.orderBy("month", "desc")
		.execute();
}

export async function findPeaksByUserId(
	userId: Tables["User"]["id"],
	division?: "both" | "tentatek" | "takoroka",
) {
	let innerQuery = db
		.selectFrom("XRankPlacement")
		.innerJoin("SplatoonPlayer", "XRankPlacement.playerId", "SplatoonPlayer.id")
		.where("SplatoonPlayer.userId", "=", userId)
		.select([
			"XRankPlacement.mode",
			"XRankPlacement.rank",
			"XRankPlacement.power",
			"XRankPlacement.region",
			"XRankPlacement.playerId",
			sql<number>`ROW_NUMBER() OVER (PARTITION BY "XRankPlacement"."mode" ORDER BY "XRankPlacement"."power" DESC)`.as(
				"rn",
			),
		]);

	if (division === "tentatek") {
		innerQuery = innerQuery.where("XRankPlacement.region", "=", "WEST");
	} else if (division === "takoroka") {
		innerQuery = innerQuery.where("XRankPlacement.region", "=", "JPN");
	}

	const rows = await db
		.selectFrom(innerQuery.as("ranked"))
		.selectAll()
		.where("rn", "=", 1)
		.execute();

	const peaksByMode = new Map(rows.map((row) => [row.mode, row]));

	return modesShort
		.map((mode) => peaksByMode.get(mode))
		.filter((p): p is NonNullable<typeof p> => p !== undefined);
}

export type FindPlacement = InferResult<
	ReturnType<typeof xRankPlacementsQueryBase>
>[number];

export async function refreshAllPeakXp() {
	await db
		.updateTable("SplatoonPlayer")
		.set({
			// denormalized PeakXP json: overall + per-division peaks (WEST = Tentatek, else Takoroka)
			peakXp: sql<string | null>`(
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
