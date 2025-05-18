import { styleText } from "node:util";
import Database from "better-sqlite3";
import {
	Kysely,
	type LogEvent,
	ParseJSONResultsPlugin,
	SqliteDialect,
} from "kysely";
import { format } from "sql-formatter";
import invariant from "~/utils/invariant";
import { roundToNDecimalPlaces } from "~/utils/number";
import type { DB } from "./tables";

const LOG_LEVEL = (["trunc", "full", "none"] as const).find(
	(val) => val === process.env.SQL_LOG,
);

const migratedEmptyDb = new Database("db-test.sqlite3").serialize();

invariant(process.env.DB_PATH, "DB_PATH env variable must be set");

export const sql = new Database(
	process.env.NODE_ENV === "test" ? migratedEmptyDb : process.env.DB_PATH,
);

sql.pragma("journal_mode = WAL");
sql.pragma("foreign_keys = ON");
sql.pragma("busy_timeout = 5000");

export const db = new Kysely<DB>({
	dialect: new SqliteDialect({
		database: sql,
	}),
	log: LOG_LEVEL === "trunc" || LOG_LEVEL === "full" ? logQuery : logError,
	plugins: [new ParseJSONResultsPlugin()],
});

function logQuery(event: LogEvent) {
	const isSelectQuery = Boolean((event.query.query as any).from?.froms);

	if (event.level === "query" && isSelectQuery) {
		const from = () =>
			(event.query.query as any).from.froms.map(
				(f: any) => f.table.identifier.name,
			);
		// biome-ignore lint/suspicious/noConsoleLog: dev only
		console.log(styleText("blue", `-- SQLITE QUERY to "${from()}" --`));
		// biome-ignore lint/suspicious/noConsoleLog: dev only
		console.log(
			styleText(
				millisToColor(event.queryDurationMillis),
				`${roundToNDecimalPlaces(event.queryDurationMillis, 1)}ms`,
			),
		);
		// biome-ignore lint/suspicious/noConsoleLog: dev only
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
		console.error(event.error);
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

	if (LOG_LEVEL === "full" || lines.length <= 11) {
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
