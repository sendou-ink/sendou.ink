import { db, sql } from "$lib/server/db/sql";
import { cached } from "$lib/server/utils/cache";

const findAllAvailableSeasonsStm = sql.prepare(
	db
		.selectFrom("XRankPlacement")
		.select(["month", "year"])
		.groupBy(["month", "year"])
		.orderBy("year", "desc")
		.orderBy("month", "desc")
		.compile().sql,
);

export const findAllAvailableSeasons = cached("asd", () => findAllAvailableSeasonsStm.all());
