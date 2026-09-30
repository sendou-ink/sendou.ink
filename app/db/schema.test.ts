import { sql } from "kysely";
import { describe, expect, test } from "vitest";
import { db } from "~/db/sql";

/** Integer primary keys that are some other table's id, not a generated one. */
const NATURAL_PRIMARY_KEYS = ["PlusTier"];

/** Integer `...Id` columns that intentionally have no foreign key. Game data ids ending in `SplId` are always exempt. */
const NOT_FOREIGN_KEYS: Record<string, string> = {
	"GroupMatchMap.stageId": "game data",
	"MapPoolMap.stageId": "game data",
	"MapResult.stageId": "game data",
	"ScrimMap.stageId": "game data",
	"TournamentMatchGameResult.stageId": "game data",
	"TournamentMatchPickBanEvent.stageId": "game data",
	"VideoMatch.stageId": "game data",
	"ChatMessageReadIndicator.lastSeenMessageId":
		"a watermark, the message itself may be deleted",
	"TournamentTeamHistory.tournamentTeamId":
		"preserves the identity of a team after it is hard-deleted",
};

describe("database schema", () => {
	test("every generated integer primary key uses AUTOINCREMENT so ids of deleted rows are never reused", async () => {
		const offenders: string[] = [];
		for (const table of await tables()) {
			if (NATURAL_PRIMARY_KEYS.includes(table.name)) continue;

			const primaryKey = table.columns.filter((column) => column.pk > 0);
			const isRowidAlias =
				primaryKey.length === 1 && primaryKey[0].type === "INTEGER";

			if (isRowidAlias && !/\bautoincrement\b/i.test(table.sql)) {
				offenders.push(table.name);
			}
		}

		expect(offenders).toEqual([]);
	});

	test("every integer id column is a foreign key", async () => {
		const offenders: string[] = [];
		for (const table of await tables()) {
			for (const column of table.columns) {
				const key = `${table.name}.${column.name}`;
				const isIdColumn =
					column.type === "INTEGER" &&
					column.pk === 0 &&
					column.name.endsWith("Id") &&
					!column.name.endsWith("SplId");
				if (!isIdColumn || NOT_FOREIGN_KEYS[key]) continue;

				if (!table.foreignKeys.some((fk) => fk.from === column.name)) {
					offenders.push(key);
				}
			}
		}

		expect(offenders).toEqual([]);
	});

	test("every NOT_FOREIGN_KEYS entry is still a column without a foreign key", async () => {
		const stale: string[] = [];
		const byName = new Map(
			(await tables()).map((table) => [table.name, table]),
		);
		for (const key of Object.keys(NOT_FOREIGN_KEYS)) {
			const [tableName, columnName] = key.split(".");
			const table = byName.get(tableName);
			const exists = table?.columns.some(
				(column) => column.name === columnName,
			);
			const hasForeignKey = table?.foreignKeys.some(
				(fk) => fk.from === columnName,
			);
			if (!exists || hasForeignKey) stale.push(key);
		}

		expect(stale).toEqual([]);
	});

	test("no foreign key sets a NOT NULL column to null on delete", async () => {
		const offenders: string[] = [];
		for (const table of await tables()) {
			for (const fk of table.foreignKeys) {
				const column = table.columns.find(
					(candidate) => candidate.name === fk.from,
				);
				if (fk.on_delete === "SET NULL" && (column?.notnull || column?.pk)) {
					offenders.push(`${table.name}.${fk.from}`);
				}
			}
		}

		expect(offenders).toEqual([]);
	});

	test("a row that uniquely owns its set null foreign key target deletes the target when it is deleted", async () => {
		const offenders: string[] = [];
		for (const table of await tables()) {
			for (const fk of table.foreignKeys) {
				const isOwner =
					fk.on_delete === "SET NULL" && table.uniqueColumns.includes(fk.from);
				const deletesTarget = table.triggers.some(
					(trigger) =>
						/\bafter delete\b/i.test(trigger) &&
						trigger.includes(`delete from "${fk.table}"`),
				);
				if (isOwner && !deletesTarget) {
					offenders.push(`${table.name}.${fk.from}`);
				}
			}
		}

		expect(offenders).toEqual([]);
	});
});

async function tables() {
	const { rows } = await sql<{ name: string; sql: string }>`
		select "name", "sql" from "sqlite_master"
		where "type" = 'table'
			and "name" not like 'sqlite_%'
			and "name" not like 'kysely_migration%'
			and "sql" not like 'create virtual table%'
			and not exists (
				select 1 from "sqlite_master" as "virtual"
				where "virtual"."sql" like 'create virtual table%'
					and "sqlite_master"."name" like "virtual"."name" || '_%'
			)
	`.execute(db);

	return Promise.all(
		rows.map(async (table) => {
			const { rows: columns } = await sql<{
				name: string;
				type: string;
				notnull: number;
				pk: number;
			}>`select "name", "type", "notnull", "pk" from pragma_table_info(${table.name})`.execute(
				db,
			);
			const { rows: foreignKeys } = await sql<{
				from: string;
				table: string;
				on_delete: string;
			}>`select "from", "table", "on_delete" from pragma_foreign_key_list(${table.name})`.execute(
				db,
			);
			const { rows: uniqueColumns } = await sql<{ name: string }>`
				select "info"."name" from pragma_index_list(${table.name}) as "list"
				join pragma_index_info("list"."name") as "info"
				where "list"."unique" = 1
					and (select count(*) from pragma_index_info("list"."name")) = 1
			`.execute(db);
			const { rows: triggers } = await sql<{ sql: string }>`
				select "sql" from "sqlite_master"
				where "type" = 'trigger' and "tbl_name" = ${table.name}
			`.execute(db);

			return {
				...table,
				columns,
				foreignKeys,
				uniqueColumns: uniqueColumns.map((column) => column.name),
				triggers: triggers.map((trigger) => trigger.sql),
			};
		}),
	);
}
