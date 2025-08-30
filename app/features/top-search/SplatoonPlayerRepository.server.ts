import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";

export function unlinkPlayerByUserId(userId: number) {
	return db
		.updateTable("SplatoonPlayer")
		.set({ userId: null })
		.where("SplatoonPlayer.userId", "=", userId)
		.execute();
}

function selector() {
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
		.leftJoin("SplatoonPlayer", "XRankPlacement.playerId", "SplatoonPlayer.id")
		.leftJoin("User", "SplatoonPlayer.userId", "User.id")
		.select(["User.discordId", "User.customUrl"]);
		// .$assertType<FindPlacement>();
}

export async function findPlacementsOfMonth(
	args: Pick<Tables["XRankPlacement"], "mode" | "region" | "month" | "year">,
) {
	return await selector()
		.where("XRankPlacement.mode", "==", args.mode)
		.where("XRankPlacement.region", "==", args.region)
		.where("XRankPlacement.month", "==", args.month)
		.where("XRankPlacement.year", "==", args.year)
		.orderBy("XRankPlacement.rank", "asc")
		.execute();
}

export async function findPlacementsByPlayerId(
	playerId: Tables["XRankPlacement"]["playerId"],
) {
	const result = await selector()
		.where("XRankPlacement.playerId", "==", playerId)
		.orderBy("XRankPlacement.year", "desc")
		.orderBy("XRankPlacement.month", "desc")
		.orderBy("XRankPlacement.rank", "desc")
		.execute();
	return result.length ? result : null;
}

export async function monthYears() {
	return await db
		.selectFrom("XRankPlacement")
		.select(["month", "year"])
		.distinct()
		.execute();
}

export type FindPlacement = Pick<
	Tables["XRankPlacement"],
	| "id"
	| "weaponSplId"
	| "name"
	| "power"
	| "rank"
	| "month"
	| "year"
	| "region"
	| "playerId"
	| "mode"
> &
	Pick<Tables["User"], "customUrl"> &
	(Pick<Tables["User"], "discordId"> | { "discordId" : null }) ;
