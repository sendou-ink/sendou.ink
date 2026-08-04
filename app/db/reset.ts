import { resetFactories } from "~/db/seed/core/defineFactory";
import { deleteAllRows } from "~/db/wipe";
import { markDatabaseClean } from "~/db/write-tracker";

/**
 * Resets all data in the database by deleting all rows from every table,
 * except for SQLite system tables and the kysely migration bookkeeping tables
 * (`kysely_migration` and `kysely_migration_lock`).
 *
 * Tests do not call this — `app/test-setup.ts` runs it after every vitest test that
 * wrote anything, and the e2e reset fixture before every test. Call it by hand only
 * to wipe *within* a test.
 */
export const dbReset = async () => {
	await deleteAllRows();

	resetFactories();
	// last, because the deletes above are themselves writes
	markDatabaseClean();
};
