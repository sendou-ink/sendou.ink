import { db, sql } from "$lib/server/db/sql";

const findAllAvailableSeasonsStm = sql.prepare(
	db
		.selectFrom("XRankPlacement")
		.select(["month", "year"])
		.groupBy(["month", "year"])
		.orderBy("year", "desc")
		.orderBy("month", "desc")
		.compile().sql,
);

export const findAllAvailableSeasons = () =>
	findAllAvailableSeasonsStm.all() as Array<{ month: number; year: number }>; // TODO: typing
