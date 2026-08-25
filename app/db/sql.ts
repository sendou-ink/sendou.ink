import { DatabaseSync } from "node:sqlite";
import { styleText } from "node:util";
import { Kysely, type LogEvent } from "kysely";
import { format } from "sql-formatter";
import { ServerConfig } from "~/config.server";
import { logger } from "~/utils/logger";
import { roundToNDecimalPlaces } from "~/utils/number";
import { EmptyValuesNoopPlugin } from "./empty-values-noop-plugin";
import { JSON_COLUMNS } from "./json-columns";
import { computedJsonColumns } from "./json-selections";
import { NodeSqliteDialect } from "./node-sqlite-dialect";
import type { DB } from "./tables";
import { WriteTrackerPlugin } from "./write-tracker";

const sql = new DatabaseSync(
	ServerConfig.isTest ? ":memory:" : ServerConfig.dbPath,
);

if (ServerConfig.isTest) {
	applyMigratedSchema(sql);
}

sql.exec("PRAGMA journal_mode = WAL");
// In WAL mode synchronous=NORMAL only risks durability across a power loss,
// transactions stay atomic, consistent and isolated
// Source: https://sqlite.org/pragma.html
sql.exec("PRAGMA synchronous = NORMAL");
sql.exec("PRAGMA foreign_keys = ON");
sql.exec("PRAGMA busy_timeout = 5000");
// 64MB page cache (default is 2MB)
sql.exec("PRAGMA cache_size = -65536");
// lets reads come straight from the OS page cache without read() syscalls
// Source: https://sqlite.org/mmap.html
sql.exec("PRAGMA mmap_size = 3221225472");
// see https://sqlite.org/pragma.html#pragma_optimize — recommended for long-lived
// connections; pair with a periodic `PRAGMA optimize;` (see OptimizeDatabase routine)
sql.exec("PRAGMA optimize = 0x10002");

// Strips diacritics so accent-insensitive name searches are possible
// (e.g. "cafe" matches "Café"). Combined with LIKE's built-in ASCII
// case-insensitivity this also folds case for the resulting latin letters.
sql.function("unaccent", { deterministic: true }, (value) =>
	typeof value === "string"
		? value.normalize("NFD").replace(/\p{M}/gu, "")
		: value,
);

export const db = new Kysely<DB>({
	dialect: new NodeSqliteDialect({
		database: sql,
		cacheStatements: true,
		jsonColumns: JSON_COLUMNS,
		computedJsonColumns,
	}),
	log,
	plugins: [new EmptyValuesNoopPlugin(), new WriteTrackerPlugin()],
});

// Every test worker gets its own in-memory database, built by replaying the
// schema of the migrated (and otherwise empty) file that scripts/ensure-test-db.ts
// creates in vitest's globalSetup. Replaying the DDL rather than copying the file
// is what `node:sqlite` allows: unlike better-sqlite3 it cannot deserialize a
// database into memory.
function applyMigratedSchema(target: DatabaseSync) {
	const source = new DatabaseSync("db-test.sqlite3", {
		readOnly: true,
		timeout: 5000,
	});

	try {
		// virtual tables create their own shadow tables (e.g. UserSearch_data), so
		// replaying those would fail on a table that already exists
		const statements = source
			.prepare(`
				SELECT sql FROM sqlite_master m
				WHERE sql IS NOT NULL
				AND name NOT LIKE 'sqlite_%'
				AND NOT EXISTS (
					SELECT 1 FROM sqlite_master AS vt
					WHERE vt.sql LIKE 'CREATE VIRTUAL TABLE%'
					AND m.name LIKE vt.name || '_%'
				)
				ORDER BY m.rowid
			`)
			.all() as Array<{ sql: string }>;

		for (const statement of statements) {
			target.exec(statement.sql);
		}
	} finally {
		source.close();
	}
}

function log(event: LogEvent) {
	if (ServerConfig.sqlLog === "trunc" || ServerConfig.sqlLog === "full") {
		logQuery(event);
	} else {
		logError(event);
	}
}

function logQuery(event: LogEvent) {
	const isSelectQuery = Boolean((event.query.query as any).from?.froms);

	if (event.level === "query" && isSelectQuery) {
		const from = () =>
			(event.query.query as any).from.froms.map(
				// plain tables have the name under table, aliased tables and
				// subqueries under alias
				(f: any) => f.table?.identifier?.name ?? f.alias?.name ?? "unknown",
			);
		// biome-ignore lint/suspicious/noConsole: dev only
		console.log(styleText("blue", `-- SQLITE QUERY to "${from()}" --`));
		// biome-ignore lint/suspicious/noConsole: dev only
		console.log(
			styleText(
				millisToColor(event.queryDurationMillis),
				`${roundToNDecimalPlaces(event.queryDurationMillis, 1)}ms`,
			),
		);
		// biome-ignore lint/suspicious/noConsole: dev only
		console.log(formatSql(event.query.sql, event.query.parameters));
	} else {
		logError(event);
	}
}

function logError(event: LogEvent) {
	if (
		event.level === "error" &&
		// an error inside a transaction rolls it back implicitly, so kysely's explicit
		// rollback then fails -> skip that follow-up error to avoid a double log
		!(event.error as any).message.includes("no transaction is active")
	) {
		logger.error(event.error);
	}
}

function millisToColor(millis: number) {
	if (millis < 1) {
		return "bgGreen";
	}
	if (millis < 5) {
		return "green";
	}
	if (millis < 50) {
		return "yellow";
	}
	return "red";
}

function formatSql(sql: string, params: readonly unknown[]) {
	const formatted = format(sql);

	const lines = formatted.split("\n");

	if (ServerConfig.sqlLog === "full" || lines.length <= 11) {
		return addParams(formatted, params);
	}

	const linesNotShown = lines.length - 10;

	return `${lines.slice(0, 10).join("\n")}\n... (${linesNotShown} more lines) ...\n`;
}

function addParams(sql: string, params: readonly unknown[]) {
	const coloredParams = params.map((param) =>
		styleText("yellow", JSON.stringify(param)),
	);

	return sql.replace(/\?/g, () => coloredParams.shift() || "");
}
