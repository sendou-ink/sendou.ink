import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	// a no-op inside a transaction, and needed off so dropping the old User table doesn't cascade
	await sql`pragma foreign_keys = off`.execute(db);

	try {
		await db.transaction().execute(async (trx) => {
			await trx.schema
				.createTable("CalendarEventVenue")
				.addColumn("eventId", "integer", (col) =>
					col.primaryKey().references("CalendarEvent.id").onDelete("cascade"),
				)
				.addColumn("name", "text", (col) => col.notNull())
				.addColumn("address", "text", (col) => col.notNull())
				.addColumn("city", "text")
				.addColumn("countryCode", "text", (col) => col.notNull())
				.addColumn("latitude", "real", (col) => col.notNull())
				.addColumn("longitude", "real", (col) => col.notNull())
				.addColumn("timezone", "text", (col) => col.notNull())
				.modifyEnd(sql`strict`)
				.execute();

			await trx.schema
				.alterTable("User")
				.addColumn("isPlaceholder", "integer", (col) =>
					col.notNull().defaultTo(0),
				)
				.execute();

			await trx.schema
				.createTable("TournamentStation")
				.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
				.addColumn("tournamentId", "integer", (col) =>
					col.notNull().references("Tournament.id").onDelete("cascade"),
				)
				.addColumn("name", "text", (col) => col.notNull())
				.addColumn("locationNote", "text")
				.addColumn("position", "integer", (col) => col.notNull())
				.modifyEnd(sql`strict`)
				.execute();

			await trx.schema
				.createIndex("tournament_station_tournament_id_position")
				.on("TournamentStation")
				.columns(["tournamentId", "position"])
				.execute();

			await trx.schema
				.createTable("TournamentMatchStation")
				.addColumn("matchId", "integer", (col) =>
					col.primaryKey().references("TournamentMatch.id").onDelete("cascade"),
				)
				.addColumn("stationId", "integer", (col) =>
					col.notNull().references("TournamentStation.id").onDelete("cascade"),
				)
				.addColumn("position", "integer", (col) => col.notNull())
				.modifyEnd(sql`strict`)
				.execute();

			await trx.schema
				.createIndex("tournament_match_station_station_id")
				.on("TournamentMatchStation")
				.column("stationId")
				.execute();

			await makeUserDiscordIdNullable(trx);
			// also holds the name an organizer typed for a placeholder player, not only Discord's
			await sql`alter table "User" rename column "discordName" to "defaultName"`.execute(
				trx,
			);

			const violations = await sql`pragma foreign_key_check`.execute(trx);
			if (violations.rows.length > 0) {
				throw new Error(
					`foreign key check failed: ${JSON.stringify(violations.rows.slice(0, 5))}`,
				);
			}
		});
	} finally {
		await sql`pragma foreign_keys = on`.execute(db);
	}
}

const DISCORD_ID_NOT_NULL = /"discordId" text unique not null/i;

/** Placeholder players have no Discord account. SQLite can't drop `not null`, so the table is rebuilt. */
async function makeUserDiscordIdNullable(trx: Kysely<any>) {
	const { rows: tables } = await sql<{ sql: string }>`
		select "sql" from "sqlite_master" where "type" = 'table' and "name" = 'User'
	`.execute(trx);
	const createSql = tables[0]?.sql;
	if (!createSql || !DISCORD_ID_NOT_NULL.test(createSql)) {
		throw new Error("User: discordId column definition not found");
	}

	const { rows: indexes } = await sql<{ sql: string }>`
		select "sql" from "sqlite_master"
		where "type" = 'index' and "tbl_name" = 'User' and "sql" is not null
	`.execute(trx);
	// renaming a table fails while any view or trigger refers to a table that doesn't exist, as User briefly doesn't
	const { rows: viewsAndTriggers } = await sql<{
		type: string;
		name: string;
		sql: string;
	}>`
		select "type", "name", "sql" from "sqlite_master"
		where "type" in ('view', 'trigger')
		order by "type" desc
	`.execute(trx);
	// generated columns are left out by table_info, they can't be inserted into
	const { rows: columns } = await sql<{ name: string }>`
		select "name" from pragma_table_info('User')
	`.execute(trx);
	const columnList = columns.map((column) => `"${column.name}"`).join(", ");

	for (const { type, name } of viewsAndTriggers) {
		await sql.raw(`drop ${type} "${name}"`).execute(trx);
	}

	await sql
		.raw(
			createSql
				.replace(/^create table "?User"?/i, 'create table "User__rebuild"')
				.replace(DISCORD_ID_NOT_NULL, '"discordId" text unique'),
		)
		.execute(trx);
	await sql
		.raw(
			`insert into "User__rebuild" (${columnList}) select ${columnList} from "User"`,
		)
		.execute(trx);
	await sql`drop table "User"`.execute(trx);
	await sql`alter table "User__rebuild" rename to "User"`.execute(trx);

	for (const index of indexes) {
		await sql.raw(index.sql).execute(trx);
	}
	for (const { sql: statement } of viewsAndTriggers) {
		await sql.raw(statement).execute(trx);
	}
}
