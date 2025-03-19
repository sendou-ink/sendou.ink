import { db } from "$lib/server/db/sql";
import { jsonObjectFrom } from "kysely/helpers/sqlite";
import type { Spl3RankedMode, Spl3XRankRegion } from "$lib/schemas/spl3";
import type { MonthYear } from "$lib/schemas/misc";

export function allAvailableSeasons() {
	return db
		.selectFrom("XRankPlacement")
		.select(["month", "year"])
		.groupBy(["month", "year"])
		.orderBy("year", "desc")
		.orderBy("month", "desc")
		.execute();
}

const findQuery = db
	.selectFrom("XRankPlacement")
	.leftJoin("SplatoonPlayer", "SplatoonPlayer.id", "XRankPlacement.playerId")
	.select(({ eb }) => [
		"XRankPlacement.id",
		"XRankPlacement.weaponSplId",
		"XRankPlacement.name",
		"XRankPlacement.power",
		"XRankPlacement.rank",
		"XRankPlacement.month",
		"XRankPlacement.year",
		"XRankPlacement.region",
		"XRankPlacement.playerId",
		"XRankPlacement.month",
		"XRankPlacement.year",
		"XRankPlacement.mode",
		jsonObjectFrom(
			eb
				.selectFrom(["User"])
				.select(["User.discordId", "User.customUrl"])
				.whereRef("SplatoonPlayer.userId", "=", "User.id"),
		).as("user"),
	]);

export function findBySeason(args: {
	season: MonthYear;
	mode: Spl3RankedMode;
	region: Spl3XRankRegion;
}) {
	console.log(args);

	return findQuery
		.where("XRankPlacement.month", "=", args.season.month)
		.where("XRankPlacement.year", "=", args.season.year)
		.where("XRankPlacement.mode", "=", args.mode)
		.where("XRankPlacement.region", "=", args.region)
		.orderBy("XRankPlacement.rank", "asc")
		.execute();
}

export function findByPlayerId(playerId: number) {
	return findQuery
		.where("XRankPlacement.playerId", "=", playerId)
		.orderBy("XRankPlacement.year", "desc")
		.orderBy("XRankPlacement.month", "desc")
		.orderBy("XRankPlacement.rank", "asc")
		.execute();
}
