import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { type Kysely, sql } from "kysely";

const SCHEMA_PATH = fileURLToPath(
	new URL("./20260803000000-initial.sql", import.meta.url),
);

const STATEMENT_SEPARATOR = "--> statement-breakpoint";

/**
 * Creates the schema as it stood when the 165 hand written migrations that came
 * before it were collapsed into this one. Only ever bootstraps an empty database:
 * production and any copy of it already has these tables, so there this migration
 * only drops the bookkeeping table of the migration runner it replaces and records
 * itself as run.
 */
export async function up(db: Kysely<any>): Promise<void> {
	// left behind by ley, which tracked the migrations collapsed into this one
	await sql`DROP TABLE IF EXISTS "migrations"`.execute(db);

	if (await hasSchema(db)) return;

	await db.transaction().execute(async (trx) => {
		for (const statement of schemaStatements()) {
			await sql.raw(statement).execute(trx);
		}
	});
}

async function hasSchema(db: Kysely<any>) {
	const { rows } = await sql<{ name: string }>`
		SELECT name FROM sqlite_master
		WHERE type = 'table'
		AND name NOT LIKE 'sqlite_%'
		AND name NOT IN ('kysely_migration', 'kysely_migration_lock')
		LIMIT 1
	`.execute(db);

	return rows.length > 0;
}

function schemaStatements() {
	return fs
		.readFileSync(SCHEMA_PATH, "utf8")
		.split(STATEMENT_SEPARATOR)
		.map((statement) => statement.trim())
		.filter((statement) => statement.length > 0);
}
