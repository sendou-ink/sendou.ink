import { sql } from "kysely";
import { resetFactories } from "~/db/seed/core/defineFactory";
import { db } from "~/db/sql";
import { markDatabaseClean } from "~/db/write-tracker";

/**
 * Resets all data in the database by deleting all rows from every table,
 * except for SQLite system tables and the 'migrations' table.
 *
 * Tests do not call this — `app/test-setup.ts` runs it after every vitest test that
 * wrote anything, and the e2e reset fixture before every test. Call it by hand only
 * to wipe *within* a test.
 */
export const dbReset = async () => {
	// virtual tables and their shadow tables (e.g. UserSearch_data) can not be
	// deleted from directly; the fts index stays in sync via the User triggers
	const { rows: tables } = await sql<{ name: string }>`
		SELECT name FROM sqlite_master
		WHERE type='table'
		AND name NOT LIKE 'sqlite_%'
		AND name NOT LIKE 'migrations'
		AND sql NOT LIKE 'CREATE VIRTUAL TABLE%'
		AND NOT EXISTS (
			SELECT 1 FROM sqlite_master AS vt
			WHERE vt.sql LIKE 'CREATE VIRTUAL TABLE%'
			AND sqlite_master.name LIKE vt.name || '_%'
		)
	`.execute(db);

	await sql`PRAGMA foreign_keys = OFF`.execute(db);
	for (const table of tables) {
		await sql`DELETE FROM ${sql.table(table.name)}`.execute(db);
	}
	await sql`PRAGMA foreign_keys = ON`.execute(db);

	resetFactories();
	// last, because the deletes above are themselves writes
	markDatabaseClean();
};
