import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { type Kysely, sql } from "kysely";

const SCHEMA_PATH = fileURLToPath(
	new URL("./20260803000000-initial.sql", import.meta.url),
);

const STATEMENT_SEPARATOR = "--> statement-breakpoint";

const LAST_COLLAPSED_MIGRATION = "164-drop-tournament-sub.js";

/**
 * Creates the schema as it stood when the 165 hand written migrations that came
 * before it were collapsed into this one. Only ever bootstraps an empty database:
 * production and any copy of it already has these tables, so there this migration
 * only drops the bookkeeping table of the migration runner it replaces and records
 * itself as run.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await assertNotBehindCollapsePoint(db);

	// left behind by ley, which tracked the migrations collapsed into this one
	await sql`DROP TABLE IF EXISTS "migrations"`.execute(db);

	if (await hasSchema(db)) return;

	await db.transaction().execute(async (trx) => {
		for (const statement of schemaStatements()) {
			await sql.raw(statement).execute(trx);
		}
	});
}

/**
 * A database still carrying ley's bookkeeping table is only safe to adopt as is if
 * ley ran every migration collapsed into this one. Otherwise it would silently be
 * left short of tables and columns this migration assumes are already there, which
 * surfaces much later as confusing "no such table" errors at query time.
 */
async function assertNotBehindCollapsePoint(db: Kysely<any>) {
	const { rows: bookkeeping } = await sql<{ name: string }>`
		SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migrations'
	`.execute(db);

	if (bookkeeping.length === 0) return;

	const { rows: applied } = await sql<{ name: string }>`
		SELECT name FROM "migrations" WHERE name = ${LAST_COLLAPSED_MIGRATION}
	`.execute(db);

	if (applied.length > 0) return;

	throw new Error(
		`Database has not run "${LAST_COLLAPSED_MIGRATION}", the last of the migrations collapsed into 20260803000000-initial, so it can't be migrated any further. Replace it with an up to date copy of production.`,
	);
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
