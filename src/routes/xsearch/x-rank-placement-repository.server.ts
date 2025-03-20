import { db } from "$lib/server/db/sql";
import type { Spl3RankedMode, Spl3XRankRegion } from "$lib/schemas/spl3";
import type { MonthYear } from "$lib/schemas/misc";
import type { InferResult } from "kysely";
import { monthYearToSeasonSpan } from "./utils";

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
		"XRankPlacement.month",
		"XRankPlacement.year",
		"XRankPlacement.mode",
	]);

export async function findBySeason(args: {
	season: MonthYear;
	mode: Spl3RankedMode;
	region: Spl3XRankRegion;
}) {
	const rows = await findQuery
		.where("XRankPlacement.month", "=", args.season.month)
		.where("XRankPlacement.year", "=", args.season.year)
		.where("XRankPlacement.mode", "=", args.mode)
		.where("XRankPlacement.region", "=", args.region)
		.orderBy("XRankPlacement.rank", "asc")
		.execute();

	return rows.map(mapEntry);
}

export async function findByPlayerId(playerId: number) {
	const rows = await findQuery
		.where("XRankPlacement.playerId", "=", playerId)
		.orderBy("XRankPlacement.year", "desc")
		.orderBy("XRankPlacement.month", "desc")
		.orderBy("XRankPlacement.rank", "asc")
		.execute();

	return rows.map(mapEntry);
}

function mapEntry(entry: InferResult<typeof findQuery>[number]) {
	const { from, to } = monthYearToSeasonSpan({ month: entry.month, year: entry.year });

	return {
		...entry,
		power: entry.power.toFixed(1),
		season: `${from.month}/${from.year} - ${to.month}/${to.year}`,
	};
}
