import { CompiledQuery, sql } from "kysely";
import { db } from "../db/sql";
import { logger } from "../utils/logger";
import { roundToNDecimalPlaces } from "../utils/number";
import { Routine } from "./routine.server";

const BYTES_IN_MB = 1024 * 1024;

/**
 * Rewrites the database file to reclaim fragmentation, mostly from migrations that drop a wide
 * column or a large index (ordinary traffic keeps the freelist in single digit MB). Readers keep
 * the pre-vacuum WAL snapshot but writers block for the whole rewrite, longer than the 5s
 * `busy_timeout`, hence a quiet hour and weekly rather than daily.
 */
export const VacuumDatabaseRoutine = new Routine({
	name: "VacuumDatabase",
	func: async () => {
		const sizeBefore = await databaseSizeInBytes();

		await db.executeQuery(CompiledQuery.raw("VACUUM"));

		const sizeAfter = await databaseSizeInBytes();

		logger.info(
			`VACUUM reclaimed ${inMb(sizeBefore - sizeAfter)}MB (${inMb(sizeBefore)}MB -> ${inMb(sizeAfter)}MB)`,
		);
	},
});

async function databaseSizeInBytes() {
	const { rows } = await sql<{
		page_count: number;
		page_size: number;
	}>`select (select * from pragma_page_count()) as page_count, (select * from pragma_page_size()) as page_size`.execute(
		db,
	);

	return rows[0].page_count * rows[0].page_size;
}

function inMb(bytes: number) {
	return roundToNDecimalPlaces(bytes / BYTES_IN_MB, 1);
}
