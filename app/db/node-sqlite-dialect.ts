import type {
	DatabaseSync,
	SQLInputValue,
	SQLOutputValue,
	StatementSync,
} from "node:sqlite";
import {
	CompiledQuery,
	createQueryId,
	type DatabaseConnection,
	type Dialect,
	type Driver,
	IdentifierNode,
	type Kysely,
	type QueryCompiler,
	type QueryResult,
	RawNode,
	type RootOperationNode,
	SelectQueryNode,
	SqliteAdapter,
	SqliteIntrospector,
	SqliteQueryCompiler,
} from "kysely";

/** Query kinds worth caching a prepared statement for; DDL, raw SQL and `begin`/`commit` are prepared fresh. */
const CACHEABLE_QUERY_KINDS = new Set([
	"SelectQueryNode",
	"InsertQueryNode",
	"UpdateQueryNode",
	"DeleteQueryNode",
	"MergeQueryNode",
]);

/** Leading keywords of raw statements that can't change the schema; any other raw statement clears the cache. */
const SCHEMA_PRESERVING_RAW_COMMANDS = new Set([
	"begin",
	"commit",
	"rollback",
	"savepoint",
	"release",
	"select",
	"with",
	"insert",
	"update",
	"delete",
	"replace",
	"pragma",
	"analyze",
	"explain",
]);

const STATEMENT_CACHE_SIZE = 5000;

const NO_COLUMNS: ReadonlySet<string> = new Set();

type ColumnDecoder = "json" | "timestamp" | null;

export interface NodeSqliteDialectConfig {
	database: DatabaseSync;
	/** Caches prepared statements by SQL. Off by default since it assumes a stable schema, untrue while migrations run. */
	cacheStatements?: boolean;
	/**
	 * "Table.column" names parsed as JSON; other text stays verbatim so JSON-shaped user input stays a string.
	 * Origin metadata sees through aliases, views, subqueries and CTEs, so use underlying table names (`AllTeam`, not `Team`).
	 */
	jsonColumns?: ReadonlySet<string>;
	/**
	 * Output names of computed JSON result columns (`jsonArrayFrom`/`jsonObjectFrom` subqueries). SQLite reports no
	 * origin for computed expressions, so only the AST tells them from a `coalesce(...)` over user text.
	 * Called once per prepared statement. Requires {@link jsonColumns}.
	 */
	computedJsonColumns?: (query: RootOperationNode) => ReadonlySet<string>;
	/**
	 * "Table.column" names of unix second timestamps read as `Date`, by column origin like {@link jsonColumns}.
	 * Any `Date` parameter is written as unix seconds regardless.
	 */
	timestampColumns?: ReadonlySet<string>;
}

/**
 * Kysely dialect over `node:sqlite` instead of the `better-sqlite3` addon. Rows are read as arrays:
 * the objects `node:sqlite` builds are slower and have a `null` prototype.
 */
export class NodeSqliteDialect implements Dialect {
	readonly #config: NodeSqliteDialectConfig;

	constructor(config: NodeSqliteDialectConfig) {
		this.#config = config;
	}

	createDriver(): Driver {
		return new NodeSqliteDriver(this.#config);
	}

	createQueryCompiler(): QueryCompiler {
		return new SqliteQueryCompiler();
	}

	createAdapter(): SqliteAdapter {
		return new SqliteAdapter();
	}

	createIntrospector(db: Kysely<any>): SqliteIntrospector {
		return new SqliteIntrospector(db);
	}
}

class NodeSqliteDriver implements Driver {
	readonly #config: NodeSqliteDialectConfig;
	#connection?: NodeSqliteConnection;

	constructor(config: NodeSqliteDialectConfig) {
		this.#config = config;
	}

	async init(): Promise<void> {
		this.#connection = new NodeSqliteConnection(this.#config);
	}

	async acquireConnection(): Promise<DatabaseConnection> {
		return this.#connection!;
	}

	async beginTransaction(connection: DatabaseConnection): Promise<void> {
		await connection.executeQuery(CompiledQuery.raw("begin"));
	}

	async commitTransaction(connection: DatabaseConnection): Promise<void> {
		await connection.executeQuery(CompiledQuery.raw("commit"));
	}

	async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
		await connection.executeQuery(CompiledQuery.raw("rollback"));
	}

	async savepoint(
		connection: DatabaseConnection,
		savepointName: string,
		compileQuery: QueryCompiler["compileQuery"],
	): Promise<void> {
		await connection.executeQuery(
			compileQuery(
				savepointCommand("savepoint", savepointName),
				createQueryId(),
			),
		);
	}

	async rollbackToSavepoint(
		connection: DatabaseConnection,
		savepointName: string,
		compileQuery: QueryCompiler["compileQuery"],
	): Promise<void> {
		await connection.executeQuery(
			compileQuery(
				savepointCommand("rollback to", savepointName),
				createQueryId(),
			),
		);
	}

	async releaseSavepoint(
		connection: DatabaseConnection,
		savepointName: string,
		compileQuery: QueryCompiler["compileQuery"],
	): Promise<void> {
		await connection.executeQuery(
			compileQuery(savepointCommand("release", savepointName), createQueryId()),
		);
	}

	async releaseConnection(): Promise<void> {
		// the single connection is never handed back to a pool
	}

	async destroy(): Promise<void> {
		this.#connection?.dispose();
		this.#config.database.close();
	}
}

/** Which result columns of one query need decoding: JSON documents by column origin and by output name for the columns that have no origin, timestamps by column origin. */
interface DecodedColumns {
	jsonByOrigin: ReadonlySet<string>;
	jsonByOutputName: ReadonlySet<string>;
	timestampsByOrigin: ReadonlySet<string>;
}

interface PreparedStatement {
	statement: StatementSync;
	/** Empty for statements that return no rows, which is how writes are detected. */
	columnNames: string[];
	/** Per result column: how to decode its values when building rows. */
	columnDecoders: ColumnDecoder[];
	/** Kept for re-deriving the decoders when the column list turns out to be stale. */
	decodedColumns?: DecodedColumns;
}

class NodeSqliteConnection implements DatabaseConnection {
	readonly #database: DatabaseSync;
	readonly #cacheStatements: boolean;
	readonly #jsonColumns?: ReadonlySet<string>;
	readonly #computedJsonColumns?: (
		query: RootOperationNode,
	) => ReadonlySet<string>;
	readonly #timestampColumns?: ReadonlySet<string>;
	readonly #cache = new Map<string, PreparedStatement>();

	constructor(config: NodeSqliteDialectConfig) {
		this.#database = config.database;
		this.#cacheStatements = config.cacheStatements ?? false;
		this.#jsonColumns = config.jsonColumns;
		this.#computedJsonColumns = config.computedJsonColumns;
		this.#timestampColumns = config.timestampColumns;
	}

	async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
		const prepared = this.#preparedStatementFor(compiledQuery);
		const parameters = toSqliteParameters(compiledQuery.parameters);

		if (prepared.columnNames.length > 0) {
			return { rows: readRows<R>(prepared, parameters) };
		}

		const { changes, lastInsertRowid } = prepared.statement.run(...parameters);

		return {
			insertId: BigInt(lastInsertRowid),
			numAffectedRows: BigInt(changes),
			rows: [],
		};
	}

	async *streamQuery<R>(
		compiledQuery: CompiledQuery,
	): AsyncIterableIterator<QueryResult<R>> {
		if (!SelectQueryNode.is(compiledQuery.query)) {
			throw new Error(
				"Sqlite driver only supports streaming of select queries",
			);
		}

		// uncached: the cursor stays open across yields, sharing the statement would reset it mid-iteration
		const prepared = prepare(
			this.#database,
			compiledQuery.sql,
			this.#decodedColumnsFor(compiledQuery.query),
		);
		const parameters = toSqliteParameters(compiledQuery.parameters);

		for (const row of prepared.statement.iterate(...parameters)) {
			yield {
				rows: [toRow<R>(prepared, row as unknown as SQLOutputValue[])],
			};
		}
	}

	dispose() {
		this.#cache.clear();
	}

	#preparedStatementFor(compiledQuery: CompiledQuery): PreparedStatement {
		const { sql, query } = compiledQuery;

		if (!this.#cacheStatements || !CACHEABLE_QUERY_KINDS.has(query.kind)) {
			// a schema change invalidates every column list the cache is holding
			if (query.kind !== "RawNode" || canChangeSchema(sql)) {
				this.#cache.clear();
			}

			return prepare(this.#database, sql, this.#decodedColumnsFor(query));
		}

		const cached = this.#cache.get(sql);
		if (cached) {
			// re-insert so the least recently used entry stays at the front
			this.#cache.delete(sql);
			this.#cache.set(sql, cached);
			return cached;
		}

		const prepared = prepare(
			this.#database,
			sql,
			this.#decodedColumnsFor(query),
		);

		if (this.#cache.size >= STATEMENT_CACHE_SIZE) {
			this.#cache.delete(this.#cache.keys().next().value!);
		}
		this.#cache.set(sql, prepared);

		return prepared;
	}

	#decodedColumnsFor(query: RootOperationNode): DecodedColumns | undefined {
		if (!this.#jsonColumns && !this.#timestampColumns) return undefined;

		return {
			jsonByOrigin: this.#jsonColumns ?? NO_COLUMNS,
			jsonByOutputName:
				(this.#jsonColumns && this.#computedJsonColumns?.(query)) || NO_COLUMNS,
			timestampsByOrigin: this.#timestampColumns ?? NO_COLUMNS,
		};
	}
}

/** `Date` parameters bound as unix seconds, the only type SQLite doesn't take as is. */
function toSqliteParameters(parameters: ReadonlyArray<unknown>) {
	if (!parameters.some((parameter) => parameter instanceof Date)) {
		return parameters as SQLInputValue[];
	}

	return parameters.map((parameter) =>
		parameter instanceof Date
			? Math.floor(parameter.getTime() / 1000)
			: (parameter as SQLInputValue),
	);
}

function canChangeSchema(sql: string) {
	const firstKeyword = sql
		.trimStart()
		.split(/[\s;(]/, 1)[0]
		.toLowerCase();

	return !SCHEMA_PRESERVING_RAW_COMMANDS.has(firstKeyword);
}

function prepare(
	database: DatabaseSync,
	sql: string,
	decodedColumns: DecodedColumns | undefined,
): PreparedStatement {
	const statement = database.prepare(sql);
	statement.setReturnArrays(true);

	return {
		statement,
		decodedColumns,
		...columnMetadata(statement, decodedColumns),
	};
}

function columnMetadata(
	statement: StatementSync,
	decodedColumns: DecodedColumns | undefined,
) {
	const columns = statement.columns();

	return {
		columnNames: columns.map((it) => it.name),
		columnDecoders: columns.map((it): ColumnDecoder => {
			if (!decodedColumns) return null;
			// null origin = computed expression (jsonArrayFrom subquery, or a coalesce over user text)
			if (it.column === null) {
				return decodedColumns.jsonByOutputName.has(it.name) ? "json" : null;
			}

			const origin = `${it.table}.${it.column}`;
			if (decodedColumns.jsonByOrigin.has(origin)) return "json";
			if (decodedColumns.timestampsByOrigin.has(origin)) return "timestamp";
			return null;
		}),
	};
}

function readRows<R>(
	prepared: PreparedStatement,
	parameters: SQLInputValue[],
): R[] {
	const rawRows = prepared.statement.all(
		...parameters,
	) as unknown as SQLOutputValue[][];

	if (rawRows.length === 0) return [];

	// `select *` widens when a migration adds a column, leaving a cached statement with a stale column list
	if (rawRows[0].length !== prepared.columnNames.length) {
		Object.assign(
			prepared,
			columnMetadata(prepared.statement, prepared.decodedColumns),
		);
	}

	const rows = new Array<R>(rawRows.length);
	for (let i = 0; i < rawRows.length; i++) {
		rows[i] = toRow<R>(prepared, rawRows[i]);
	}

	return rows;
}

function toRow<R>(prepared: PreparedStatement, rawRow: SQLOutputValue[]): R {
	const { columnNames, columnDecoders } = prepared;

	const row: Record<string, unknown> = {};
	for (let i = 0; i < columnNames.length; i++) {
		const value = rawRow[i];
		const decoder = columnDecoders[i];
		if (decoder === "json" && typeof value === "string" && maybeJson(value)) {
			row[columnNames[i]] = parseJsonValue(value);
		} else if (decoder === "timestamp" && typeof value === "number") {
			row[columnNames[i]] = new Date(value * 1000);
		} else {
			row[columnNames[i]] = value;
		}
	}

	return row as R;
}

function maybeJson(value: string) {
	return (
		(value.startsWith("{") && value.endsWith("}")) ||
		(value.startsWith("[") && value.endsWith("]"))
	);
}

function parseJsonValue(value: string): unknown {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return value;
	}

	if (mayPrototypePollute(value)) {
		sanitizeParsedJson(parsed);
	}
	return parsed;
}

/** Could the raw document hold a `__proto__`/`constructor` key? `\u` escapes could spell either, so those walk too. */
function mayPrototypePollute(value: string) {
	return (
		value.includes("__proto__") ||
		value.includes("constructor") ||
		value.includes("\\u")
	);
}

/** Strips `__proto__` and `constructor.prototype` so the parsed document can not prototype-pollute downstream merges. */
function sanitizeParsedJson(value: unknown) {
	if (Array.isArray(value)) {
		for (const item of value) {
			sanitizeParsedJson(item);
		}
		return;
	}

	if (!isPlainObject(value)) return;

	for (const key of Object.keys(value)) {
		if (key === "__proto__") {
			delete value[key];
			continue;
		}

		const child = value[key];
		if (
			key === "constructor" &&
			isPlainObject(child) &&
			Object.hasOwn(child, "prototype")
		) {
			delete child.prototype;
		}

		sanitizeParsedJson(child);
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null) return false;

	const proto = Object.getPrototypeOf(value);
	return proto === null || proto === Object.prototype;
}

function savepointCommand(command: string, savepointName: string) {
	return RawNode.createWithChildren([
		RawNode.createWithSql(`${command} `),
		IdentifierNode.create(savepointName),
	]);
}
