import type { DatabaseSync } from "node:sqlite";

export interface TableMetadata {
	kind: "table" | "view" | "virtual";
	columns: string[];
	/** Always every column of a view, SQLite doesn't track nullability through them. */
	nullable: string[];
	withDefault: string[];
	/** Never written by app code: an autoincrement primary key or a generated column. */
	generatedAlways: string[];
	primaryKey: string[];
	/** Column sets guaranteed unique, the primary key included. Partial and expression indexes are left out. */
	uniqueKeys: string[][];
	/** Column → `"Table.column"` it references. */
	foreignKeys: Record<string, string>;
	/** Names of the triggers that fire on writes to this table. */
	triggers: string[];
}

/** Reads the tables and views of a migrated database into the shape of `schema.gen.ts`. */
export function introspectSchema(
	database: DatabaseSync,
): Record<string, TableMetadata> {
	const objects = database
		.prepare(`
			select "name", "type", "sql" from "sqlite_master" as "m"
			where "type" in ('table', 'view')
				and "name" not like 'sqlite_%'
				and "name" not like 'kysely_migration%'
				and not exists (
					select 1 from "sqlite_master" as "vt"
					where "vt"."sql" like 'create virtual table%'
						and "m"."name" like "vt"."name" || '_%'
				)
			order by "name"
		`)
		.all() as Array<{ name: string; type: "table" | "view"; sql: string }>;

	const primaryKeys = new Map(
		objects.map((object) => [object.name, primaryKeyOf(database, object.name)]),
	);

	const result: Record<string, TableMetadata> = {};
	for (const object of objects) {
		const kind = /^create virtual table/i.test(object.sql)
			? "virtual"
			: object.type;
		const primaryKey = primaryKeys.get(object.name) ?? [];

		result[object.name] = {
			kind,
			...columnsOf(database, object, primaryKey),
			primaryKey,
			uniqueKeys: kind === "table" ? uniqueKeysOf(database, object.name) : [],
			foreignKeys: foreignKeysOf(database, object.name, primaryKeys),
			triggers: triggersOf(database, object.name),
		};
	}

	return result;
}

function columnsOf(
	database: DatabaseSync,
	object: { name: string; type: "table" | "view"; sql: string },
	primaryKey: string[],
) {
	const rows = database
		.prepare(`select * from pragma_table_xinfo(?) order by "cid"`)
		.all(object.name) as Array<{
		name: string;
		type: string;
		notnull: number;
		dflt_value: string | null;
		hidden: number;
	}>;

	const isAutoIncrementKey = (column: string) =>
		primaryKey.length === 1 &&
		primaryKey[0] === column &&
		/\bautoincrement\b/i.test(object.sql);

	const result: Pick<
		TableMetadata,
		"columns" | "nullable" | "withDefault" | "generatedAlways"
	> = { columns: [], nullable: [], withDefault: [], generatedAlways: [] };
	for (const row of rows) {
		// hidden = 1 are a virtual table's internal columns, 2 and 3 are generated columns
		if (row.hidden === 1) continue;

		const isRowidAlias =
			primaryKey.length === 1 &&
			primaryKey[0] === row.name &&
			row.type.toUpperCase() === "INTEGER";

		result.columns.push(row.name);
		if (row.notnull === 0 && !isRowidAlias) result.nullable.push(row.name);
		if (row.dflt_value !== null) result.withDefault.push(row.name);
		if (row.hidden === 2 || row.hidden === 3 || isAutoIncrementKey(row.name)) {
			result.generatedAlways.push(row.name);
		}
	}

	return result;
}

function primaryKeyOf(database: DatabaseSync, table: string) {
	const rows = database
		.prepare(`select "name", "pk" from pragma_table_info(?) where "pk" > 0`)
		.all(table) as Array<{ name: string; pk: number }>;

	return rows.sort((a, b) => a.pk - b.pk).map((row) => row.name);
}

function uniqueKeysOf(database: DatabaseSync, table: string) {
	const indexes = database
		.prepare(
			`select "name", "partial" from pragma_index_list(?) where "unique" = 1`,
		)
		.all(table) as Array<{ name: string; partial: number }>;

	const keys: string[][] = [];
	const primaryKey = primaryKeyOf(database, table);
	if (primaryKey.length > 0) keys.push(primaryKey);

	for (const index of indexes) {
		if (index.partial === 1) continue;

		const columns = database
			.prepare(
				`select "name", "cid" from pragma_index_info(?) order by "seqno"`,
			)
			.all(index.name) as Array<{ name: string | null; cid: number }>;

		const isExpressionIndex = columns.some((column) => column.cid < 0);
		if (isExpressionIndex) continue;

		const key = columns.map((column) => column.name as string);
		const alreadyListed = keys.some(
			(existing) =>
				existing.length === key.length &&
				existing.every((column) => key.includes(column)),
		);
		if (!alreadyListed) keys.push(key);
	}

	return keys;
}

function foreignKeysOf(
	database: DatabaseSync,
	table: string,
	primaryKeys: Map<string, string[]>,
) {
	const rows = database
		.prepare(`select * from pragma_foreign_key_list(?) order by "id", "seq"`)
		.all(table) as Array<{
		seq: number;
		table: string;
		from: string;
		to: string | null;
	}>;

	const foreignKeys: Record<string, string> = {};
	for (const row of rows) {
		const targetColumn = row.to ?? primaryKeys.get(row.table)?.[row.seq];
		foreignKeys[row.from] = `${row.table}.${targetColumn}`;
	}

	return foreignKeys;
}

function triggersOf(database: DatabaseSync, table: string) {
	const rows = database
		.prepare(
			`select "name" from "sqlite_master" where "type" = 'trigger' and "tbl_name" = ? order by "name"`,
		)
		.all(table) as Array<{ name: string }>;

	return rows.map((row) => row.name);
}
