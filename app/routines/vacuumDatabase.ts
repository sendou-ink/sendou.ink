import { CompiledQuery, sql } from "kysely";
import { db } from "../db/sql";
import { logger } from "../utils/logger";
import { roundToNDecimalPlaces } from "../utils/number";
import { Routine } from "./routine.server";

const BYTES_IN_MB = 1024 * 1024;

/**
 * Rewrites the database file so the space that deletes and dropped columns leave behind as
 * partially filled pages is given back to the disk. Ordinary traffic frees very little of it,
 * the freelist stays in the single digit megabytes, so what this actually collects is the
 * fragmentation left by migrations that drop a wide column or a large index.
 *
 * Readers are unaffected because WAL serves them the pre-vacuum snapshot, but writers block
 * for the whole rewrite and `busy_timeout` is 5s, which the rewrite outlasts. It is scheduled
 * for a quiet hour for that reason, and the write errors it can cause there are the reason it
 * is weekly rather than daily.
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
