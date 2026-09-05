import { sql } from "kysely";
import { db } from "~/db/sql";

/** Deletes every row of every table, leaving the schema and migration bookkeeping in place. */
export async function deleteAllRows() {
	// virtual tables and their shadow tables (e.g. UserSearch_data) can't be deleted from; the User triggers keep the fts index in sync
	const { rows: tables } = await sql<{ name: string }>`
		SELECT name FROM sqlite_master
		WHERE type='table'
		AND name NOT LIKE 'sqlite_%'
		AND name NOT LIKE 'kysely_migration%'
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
}
