import { styleText } from "node:util";
import * as Sentry from "@sentry/react-router";
import Database from "better-sqlite3";
import { Kysely, type LogEvent, SqliteDialect } from "kysely";
import { format } from "sql-formatter";
import { Config } from "~/config";
import { ServerConfig } from "~/config.server";
import { logger } from "~/utils/logger";
import { roundToNDecimalPlaces } from "~/utils/number";
import { FastParseJSONResultsPlugin } from "./parse-json-results-plugin";
import type { DB } from "./tables";

const migratedEmptyDb = new Database("db-test.sqlite3").serialize();

export const sql = new Database(
	ServerConfig.isTest ? migratedEmptyDb : ServerConfig.dbPath,
);

sql.pragma("journal_mode = WAL");
// The synchronous=NORMAL setting provides the best balance between performance and safety for most applications running in WAL mode.
// You lose durability across power lose with synchronous NORMAL in WAL mode, but that is not important for most applications.
// Transactions are still atomic, consistent, and isolated, which are the most important characteristics in most use cases.
// Source: https://sqlite.org/pragma.html
sql.pragma("synchronous = NORMAL");
sql.pragma("foreign_keys = ON");
sql.pragma("busy_timeout = 5000");
// 64MB page cache (default is 2MB)
sql.pragma("cache_size = -65536");
// lets reads come straight from the OS page cache without read() syscalls
// Source: https://sqlite.org/mmap.html
sql.pragma("mmap_size = 3221225472");
// see https://sqlite.org/pragma.html#pragma_optimize — recommended for long-lived
// connections; pair with a periodic `PRAGMA optimize;` (see OptimizeDatabase routine)
sql.pragma("optimize = 0x10002");

// Strips diacritics so accent-insensitive name searches are possible
// (e.g. "cafe" matches "Café"). Combined with LIKE's built-in ASCII
// case-insensitivity this also folds case for the resulting latin letters.
sql.function("unaccent", { deterministic: true }, (value) =>
	typeof value === "string"
		? value.normalize("NFD").replace(/\p{M}/gu, "")
		: value,
);

export const db = new Kysely<DB>({
	dialect: new SqliteDialect({
		database: sql,
	}),
	log,
	plugins: [new FastParseJSONResultsPlugin()],
});

function log(event: LogEvent) {
	if (Config.sentry.enabled && event.level === "query") {
		// Backdated span so the query nests under the active loader/action span
		// in Sentry's waterfall. `onlyIfParent: true` skips emission when there's
		// no active trace (e.g. cron routines), avoiding orphan root spans.
		Sentry.startInactiveSpan({
			name: event.query.sql,
			op: "db.sql.query",
			startTime: new Date(Date.now() - event.queryDurationMillis),
			onlyIfParent: true,
		}).end();
	}

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
		// it seems that this error happens everytime something goes wrong inside transaction
		// my guess is that the transaction is already implicitly rolled back in the case of error
		// but kysely also does it explicitly -> fails because there is no transaction to rollback.
		// this `logError` function at least makes it so that due to that the error doesn't get logged
		// but of course the best solution would also avoid useless rollbacks, something for the future
		// btw this particular check is here just to avoid the double "no transaction is active" log
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
