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
	SelectQueryNode,
	SqliteAdapter,
	SqliteIntrospector,
	SqliteQueryCompiler,
} from "kysely";

/**
 * Query kinds whose compiled SQL is stable enough to keep a prepared statement
 * around for. Everything else (DDL, raw SQL, `begin`/`commit`) is prepared fresh.
 */
const CACHEABLE_QUERY_KINDS = new Set([
	"SelectQueryNode",
	"InsertQueryNode",
	"UpdateQueryNode",
	"DeleteQueryNode",
	"MergeQueryNode",
]);

/**
 * Leading keywords of raw statements that can not change the schema, so the
 * column lists the statement cache is holding stay valid across them. Raw DDL
 * (`create`, `alter`, `drop`, ...) is not here and clears the cache.
 */
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

export interface NodeSqliteDialectConfig {
	database: DatabaseSync;
	/**
	 * Keeps prepared statements around between queries, keyed by their SQL. Saves
	 * a re-compile per query at the cost of holding onto the compiled programs.
	 * Off by default because it assumes the schema does not change under the
	 * connection, which is not true while migrations run.
	 */
	cacheStatements?: boolean;
}

/**
 * Kysely dialect backed by Node's built-in `node:sqlite` module, replacing the
 * `better-sqlite3` native addon that Kysely's own `SqliteDialect` expects.
 *
 * Rows come back from `node:sqlite` as arrays rather than objects: the objects it
 * builds itself are both slower to produce and have a `null` prototype, which is
 * not what the rest of the codebase (or Kysely's own dialects) hand out.
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

interface PreparedStatement {
	statement: StatementSync;
	/** Empty for statements that return no rows, which is how writes are detected. */
	columnNames: string[];
}

class NodeSqliteConnection implements DatabaseConnection {
	readonly #database: DatabaseSync;
	readonly #cacheStatements: boolean;
	readonly #cache = new Map<string, PreparedStatement>();

	constructor(config: NodeSqliteDialectConfig) {
		this.#database = config.database;
		this.#cacheStatements = config.cacheStatements ?? false;
	}

	async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
		const prepared = this.#preparedStatementFor(compiledQuery);
		const parameters = compiledQuery.parameters as SQLInputValue[];

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

		// deliberately uncached: the cursor stays open across yields, so sharing the
		// statement with another query would reset it mid-iteration
		const prepared = prepare(this.#database, compiledQuery.sql);
		const parameters = compiledQuery.parameters as SQLInputValue[];

		for (const row of prepared.statement.iterate(...parameters)) {
			yield {
				rows: [
					toRow<R>(prepared.columnNames, row as unknown as SQLOutputValue[]),
				],
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

			return prepare(this.#database, sql);
		}

		const cached = this.#cache.get(sql);
		if (cached) {
			// re-insert so the least recently used entry stays at the front
			this.#cache.delete(sql);
			this.#cache.set(sql, cached);
			return cached;
		}

		const prepared = prepare(this.#database, sql);

		if (this.#cache.size >= STATEMENT_CACHE_SIZE) {
			this.#cache.delete(this.#cache.keys().next().value!);
		}
		this.#cache.set(sql, prepared);

		return prepared;
	}
}

function canChangeSchema(sql: string) {
	const firstKeyword = sql
		.trimStart()
		.split(/[\s;(]/, 1)[0]
		.toLowerCase();

	return !SCHEMA_PRESERVING_RAW_COMMANDS.has(firstKeyword);
}

function prepare(database: DatabaseSync, sql: string): PreparedStatement {
	const statement = database.prepare(sql);
	statement.setReturnArrays(true);

	return { statement, columnNames: statement.columns().map((it) => it.name) };
}

function readRows<R>(
	prepared: PreparedStatement,
	parameters: SQLInputValue[],
): R[] {
	const rawRows = prepared.statement.all(
		...parameters,
	) as unknown as SQLOutputValue[][];

	if (rawRows.length === 0) return [];

	// `select *` widens when a migration adds a column, leaving a cached statement
	// with a stale column list until the next read notices the mismatch
	if (rawRows[0].length !== prepared.columnNames.length) {
		prepared.columnNames = prepared.statement.columns().map((it) => it.name);
	}

	const rows = new Array<R>(rawRows.length);
	for (let i = 0; i < rawRows.length; i++) {
		rows[i] = toRow<R>(prepared.columnNames, rawRows[i]);
	}

	return rows;
}

function toRow<R>(columnNames: string[], rawRow: SQLOutputValue[]): R {
	const row: Record<string, SQLOutputValue> = {};
	for (let i = 0; i < columnNames.length; i++) {
		row[columnNames[i]] = rawRow[i];
	}

	return row as R;
}

function savepointCommand(command: string, savepointName: string) {
	return RawNode.createWithChildren([
		RawNode.createWithSql(`${command} `),
		IdentifierNode.create(savepointName),
	]);
}
