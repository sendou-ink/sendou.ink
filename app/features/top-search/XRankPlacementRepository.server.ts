import type { InferResult } from "kysely";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";

export function unlinkPlayerByUserId(userId: number) {
	return db
		.updateTable("SplatoonPlayer")
		.set({ userId: null })
		.where("SplatoonPlayer.userId", "=", userId)
		.execute();
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
	options?: { limit: number },
) {
	let query = xRankPlacementsQueryBase()
		.where("SplatoonPlayer.userId", "=", userId)
		.orderBy("XRankPlacement.power", "desc");

	if (options?.limit) {
		query = query.limit(options.limit);
	}

	const result = await query.execute();
	return result.length ? result : null;
}

export async function monthYears() {
	return await db
		.selectFrom("XRankPlacement")
		.select(["month", "year"])
		.distinct()
		.orderBy("year", "desc")
		.orderBy("month", "desc")
		.execute();
}

export type FindPlacement = InferResult<
	ReturnType<typeof xRankPlacementsQueryBase>
>[number];
