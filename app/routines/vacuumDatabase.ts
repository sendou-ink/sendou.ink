import { CompiledQuery, sql } from "kysely";
import { db } from "../db/sql";
import { logger } from "../utils/logger";
import { roundToNDecimalPlaces } from "../utils/number";
import { Routine } from "./routine.server";

const BYTES_IN_MB = 1024 * 1024;

/** Under this the rewrite costs far more than it reclaims, so it is not worth blocking writes for. */
const MINIMUM_FREELIST_BYTES = 200 * BYTES_IN_MB;

/**
 * Rewrites the database file to reclaim fragmentation, mostly from migrations that drop a wide
 * column or a large index (ordinary traffic keeps the freelist in single digit MB, so most weeks
 * this skips). Readers keep the pre-vacuum WAL snapshot but writers block for the whole rewrite,
 * longer than the 5s `busy_timeout`, hence a quiet hour and weekly rather than daily.
 */
export const VacuumDatabaseRoutine = new Routine({
	name: "VacuumDatabase",
	func: async () => {
		const freelistBytes = await freelistSizeInBytes();

		if (freelistBytes < MINIMUM_FREELIST_BYTES) {
			logger.info(
				`Skipping VACUUM, only ${inMb(freelistBytes)}MB of the database is reclaimable`,
			);
			return;
		}

		const sizeBefore = await databaseSizeInBytes();

		await db.executeQuery(CompiledQuery.raw("VACUUM"));
		await db.executeQuery(CompiledQuery.raw("PRAGMA wal_checkpoint(TRUNCATE)"));

		const sizeAfter = await databaseSizeInBytes();

		logger.info(
			`VACUUM reclaimed ${inMb(sizeBefore - sizeAfter)}MB (${inMb(sizeBefore)}MB -> ${inMb(sizeAfter)}MB)`,
		);
	},
});

async function freelistSizeInBytes() {
	const { rows } = await sql<{
		freelist_count: number;
		page_size: number;
	}>`select (select * from pragma_freelist_count()) as freelist_count, (select * from pragma_page_size()) as page_size`.execute(
		db,
	);

	return rows[0].freelist_count * rows[0].page_size;
}

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
