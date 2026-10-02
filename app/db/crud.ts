import {
	type Compilable,
	createQueryId,
	type ExpressionBuilder,
	type Insertable,
	type OnConflictBuilder,
	type OrderByDirection,
	type QueryResult,
	type RootOperationNode,
	type Selectable,
	type Transaction,
	type Updateable,
} from "kysely";
import { databaseTimestampNow } from "~/utils/dates";
import { SCHEMA } from "./schema.gen";
import type {
	ColumnFilter,
	HasIdPrimaryKey,
	HasUniqueKey,
	IsView,
	Row,
	TableName,
	UniqueKey,
	UniqueWhere,
} from "./schema-types";
import { db } from "./sql";
import type { DB } from "./tables";

const UPDATED_AT = "updatedAt";
// bounds the compiled queries of one table; shapes come from code, so it is only reached by a bug
const COMPILED_QUERIES_LIMIT = 500;

/**
 * Generic single-table operations typed from `tables.ts` plus the generated schema metadata. The
 * ops a table gets follow its keys: `findById`/`updateById`/`deleteById` need a single `id`
 * primary key, `findOneBy`/`upsert` a unique key, and views get no writes. Updates stamp
 * `updatedAt` themselves on tables that have one. Repositories re-export the ops they want to
 * expose: `export const { deleteById } = crud("Build")`, or `.except(...)` columns the repository
 * keeps consistent itself: `export const { updateById } = crud("Team").except("customUrl")`.
 */
export function crud<T extends TableName>(table: T): CrudOps<T> {
	// the ops are typed per table by CrudOps, the body is table agnostic
	const executor = (trx?: Transaction<DB>): any => trx ?? db;
	const primaryKey: readonly string[] = SCHEMA[table].primaryKey;
	const returnsId = () => primaryKey.length === 1 && primaryKey[0] === "id";
	const stampsUpdatedAt = (SCHEMA[table].columns as readonly string[]).includes(
		UPDATED_AT,
	);
	const stamped = (values: Record<string, unknown>) =>
		stampsUpdatedAt
			? { ...values, [UPDATED_AT]: databaseTimestampNow() }
			: values;

	const selectWhere = (where: Record<string, unknown>, trx?: Transaction<DB>) =>
		applyWhere(executor(trx).selectFrom(table), table, where);

	// `null` marks a shape whose compiled parameters didn't line up with the values, built every call
	const compiledQueries = new Map<string, CompiledShape | null>();

	/**
	 * Runs the query compiled once per `shape` (op plus which columns it names), binding
	 * `parameters` to the SQL. Values that compile into the SQL itself (expressions, lists in a
	 * filter) build the query every call.
	 */
	const runCompiled = (
		shape: string | null,
		parameters: unknown[],
		build: () => Compilable,
		trx?: Transaction<DB>,
	): Promise<QueryResult<any>> => {
		const target = executor(trx);
		const known = shape === null ? null : compiledQueries.get(shape);
		if (known) {
			return target.executeQuery({
				...known,
				parameters,
				queryId: createQueryId(),
			});
		}

		const compiled = build().compile();
		if (
			shape !== null &&
			known === undefined &&
			compiledQueries.size < COMPILED_QUERIES_LIMIT
		) {
			compiledQueries.set(
				shape,
				sameParameters(compiled.parameters, parameters)
					? { sql: compiled.sql, query: compiled.query }
					: null,
			);
		}

		return target.executeQuery(compiled);
	};

	const selectRows = (
		op: string,
		where: Record<string, unknown>,
		extraParameters: unknown[],
		build: (query: any) => any,
		trx?: Transaction<DB>,
	) => {
		const filter = filterShape(where);
		return runCompiled(
			filter && `${op}:${filter.shape}`,
			[...(filter?.parameters ?? []), ...extraParameters],
			() => build(selectWhere(where, trx)),
			trx,
		);
	};

	const ops = {
		findById: (id: number, trx?: Transaction<DB>) => ops.findOneBy({ id }, trx),
		findOneBy: async (
			where: Record<string, unknown>,
			trx?: Transaction<DB>,
		) => {
			const { rows } = await selectRows(
				"findOneBy",
				where,
				[],
				(query) => query.selectAll(),
				trx,
			);
			return rows[0];
		},
		findManyBy: async (
			where: Record<string, unknown>,
			options: FindManyOptions<string>,
			trx?: Transaction<DB>,
		) => {
			const orderBy = options.orderBy ?? [];
			const { rows } = await selectRows(
				`findManyBy(${orderBy.join(";")})`,
				where,
				[options.limit],
				(query) => {
					let result = query.selectAll();
					for (const [column, direction] of orderBy) {
						result = result.orderBy(`${table}.${column}`, direction);
					}
					return result.limit(options.limit);
				},
				trx,
			);
			return rows;
		},
		exists: async (where: Record<string, unknown>, trx?: Transaction<DB>) => {
			const { rows } = await selectRows(
				"exists",
				where,
				[1],
				(query) =>
					query
						.select((eb: ExpressionBuilder<any, any>) => eb.lit(1).as("found"))
						.limit(1),
				trx,
			);
			return rows.length > 0;
		},
		count: async (where: Record<string, unknown>, trx?: Transaction<DB>) => {
			const { rows } = await selectRows(
				"count",
				where,
				[],
				(query) =>
					query.select((eb: ExpressionBuilder<any, any>) =>
						eb.fn.countAll<number>().as("count"),
					),
				trx,
			);
			return rows[0].count as number;
		},
		insert: async (values: Record<string, unknown>, trx?: Transaction<DB>) => {
			const written = valuesShape(values);
			const { rows } = await runCompiled(
				written && `insert:${written.shape}`,
				written?.parameters ?? [],
				() => {
					const query = executor(trx).insertInto(table).values(values);
					return returnsId() ? query.returning("id") : query;
				},
				trx,
			);
			if (!returnsId()) return;
			if (!rows[0]) {
				throw new Error(`crud insert into "${table}" returned no id`);
			}
			return rows[0];
		},
		insertMany: async (
			values: Record<string, unknown>[],
			trx?: Transaction<DB>,
		) => {
			if (values.length === 0) return returnsId() ? [] : undefined;

			const query = executor(trx).insertInto(table).values(values);
			if (!returnsId()) {
				await query.execute();
				return;
			}
			return query.returning("id").execute();
		},
		upsert: async (
			values: Record<string, unknown>,
			options: { conflict: readonly string[]; update: readonly string[] },
			trx?: Transaction<DB>,
		) => {
			const leavesExisting = options.update.length === 0;
			const query = executor(trx)
				.insertInto(table)
				.values(values)
				.onConflict((oc: OnConflictBuilder<any, any>) => {
					const target = oc.columns(options.conflict);
					if (leavesExisting) return target.doNothing();

					return target.doUpdateSet((eb: ExpressionBuilder<any, any>) =>
						stamped(
							Object.fromEntries(
								options.update.map((column) => [
									column,
									eb.ref(`excluded.${column}`),
								]),
							),
						),
					);
				});
			if (!returnsId()) {
				await query.execute();
				return;
			}
			if (!leavesExisting) {
				return query.returning("id").executeTakeFirstOrThrow();
			}

			// do nothing returns no row on a conflict, so the existing row's id is looked up by its key
			return (
				(await query.returning("id").executeTakeFirst()) ??
				selectWhere(
					Object.fromEntries(
						options.conflict.map((column) => [column, values[column]]),
					),
					trx,
				)
					.select(`${table}.id`)
					.executeTakeFirstOrThrow()
			);
		},
		update: async (
			where: Record<string, unknown>,
			values: Record<string, unknown>,
			trx?: Transaction<DB>,
		) => {
			assertNotEmpty(where, "update");
			const set = stamped(values);
			const written = valuesShape(set);
			const filter = filterShape(where);
			const { numAffectedRows } = await runCompiled(
				written && filter && `update:${written.shape}:${filter.shape}`,
				[...(written?.parameters ?? []), ...(filter?.parameters ?? [])],
				() =>
					applyWhere(executor(trx).updateTable(table).set(set), table, where),
				trx,
			);
			return Number(numAffectedRows);
		},
		updateById: (
			id: number,
			values: Record<string, unknown>,
			trx?: Transaction<DB>,
		) => ops.update({ id }, values, trx).then((count) => count > 0),
		delete: async (where: Record<string, unknown>, trx?: Transaction<DB>) => {
			assertNotEmpty(where, "delete");
			const filter = filterShape(where);
			const { numAffectedRows } = await runCompiled(
				filter && `delete:${filter.shape}`,
				filter?.parameters ?? [],
				() => applyWhere(executor(trx).deleteFrom(table), table, where),
				trx,
			);
			return Number(numAffectedRows);
		},
		deleteById: (id: number, trx?: Transaction<DB>) =>
			ops.delete({ id }, trx).then((count) => count > 0),
		except: (...columns: string[]) => {
			const assertNotWritten = (values: Record<string, unknown>) => {
				const written = columns.filter(
					(column) => values[column] !== undefined,
				);
				if (written.length > 0) {
					throw new Error(
						`crud("${table}") excepts ${written.join(", ")}, write it through the repository`,
					);
				}
			};

			return {
				findById: ops.findById,
				findOneBy: ops.findOneBy,
				findManyBy: ops.findManyBy,
				exists: ops.exists,
				count: ops.count,
				delete: ops.delete,
				deleteById: ops.deleteById,
				update: async (
					where: Record<string, unknown>,
					values: Record<string, unknown>,
					trx?: Transaction<DB>,
				) => {
					assertNotWritten(values);
					return ops.update(where, values, trx);
				},
				updateById: async (
					id: number,
					values: Record<string, unknown>,
					trx?: Transaction<DB>,
				) => {
					assertNotWritten(values);
					return ops.updateById(id, values, trx);
				},
			};
		},
	};

	return ops as unknown as CrudOps<T>;
}

/** What an update may set: `updatedAt` is stamped by `crud` itself. */
type UpdateValues<T extends TableName> = Omit<
	Updateable<DB[T]>,
	typeof UPDATED_AT
>;

type FindManyOptions<Column extends string> = {
	/** Every list read is bounded. */
	limit: number;
	orderBy?: Array<[Column, OrderByDirection]>;
};

/** A filter naming at least one column, so a write can never hit the whole table by accident. */
type NonEmptyFilter<T extends TableName> = {
	[C in keyof Row<T>]: Pick<Row<T>, C> & ColumnFilter<T>;
}[keyof Row<T>];

type InsertResult<T extends TableName> =
	HasIdPrimaryKey<T> extends true ? { id: number } : undefined;

type ReadOps<T extends TableName> = {
	/** Rows matching every column of `where`. */
	findManyBy(
		where: ColumnFilter<T>,
		options: FindManyOptions<keyof Row<T> & string>,
		trx?: Transaction<DB>,
	): Promise<Selectable<DB[T]>[]>;
	/** Whether any row matches every column of `where`. */
	exists(where: ColumnFilter<T>, trx?: Transaction<DB>): Promise<boolean>;
	/** Number of rows matching every column of `where`. */
	count(where: ColumnFilter<T>, trx?: Transaction<DB>): Promise<number>;
} & (HasUniqueKey<T> extends true
	? {
			/** The row matching a complete unique key. */
			findOneBy(
				where: UniqueWhere<T>,
				trx?: Transaction<DB>,
			): Promise<Selectable<DB[T]> | undefined>;
		}
	: unknown) &
	(HasIdPrimaryKey<T> extends true
		? {
				findById(
					id: number,
					trx?: Transaction<DB>,
				): Promise<Selectable<DB[T]> | undefined>;
			}
		: unknown);

/** Updates and deletes, `V` being what an update may set. */
type ChangeOps<T extends TableName, V> = {
	/** Updates the rows matching `where`, returning how many there were. */
	update(
		where: NonEmptyFilter<T>,
		values: V,
		trx?: Transaction<DB>,
	): Promise<number>;
	/** Deletes the rows matching `where`, returning how many there were. */
	delete(where: NonEmptyFilter<T>, trx?: Transaction<DB>): Promise<number>;
} & (HasIdPrimaryKey<T> extends true
	? {
			/** Updates the row, returning whether it existed. With no values it only stamps `updatedAt`. */
			updateById(
				id: number,
				values: V,
				trx?: Transaction<DB>,
			): Promise<boolean>;
			/** Deletes the row, returning whether it existed. */
			deleteById(id: number, trx?: Transaction<DB>): Promise<boolean>;
		}
	: unknown);

type WriteOps<T extends TableName> = ChangeOps<T, UpdateValues<T>> & {
	/** Inserts a row, returning its id when the table has one. */
	insert(
		values: Insertable<DB[T]>,
		trx?: Transaction<DB>,
	): Promise<InsertResult<T>>;
	/** Inserts rows in one statement, returning their ids in insertion order when the table has them. */
	insertMany(
		values: Insertable<DB[T]>[],
		trx?: Transaction<DB>,
	): Promise<HasIdPrimaryKey<T> extends true ? { id: number }[] : undefined>;
	/**
	 * The reads, updates and deletes without the given columns, for the ones the repository keeps
	 * consistent itself (a derived value, a write with side effects). Updates setting one throw,
	 * in case a spread slipped it past the types. Inserts and upserts set every column, so they
	 * stay hand-written.
	 */
	except<const K extends keyof UpdateValues<T> & string>(
		...columns: K[]
	): ReadOps<T> & ChangeOps<T, Omit<UpdateValues<T>, K>>;
} & (HasUniqueKey<T> extends true
		? {
				/**
				 * Inserts the row, or updates the `update` columns of the one it conflicts with on the
				 * `conflict` unique key. An empty `update` leaves a conflicting row as it is (`updatedAt`
				 * included) and returns its id.
				 */
				upsert(
					values: Insertable<DB[T]>,
					options: {
						conflict: UniqueKey<T>;
						update: ReadonlyArray<keyof UpdateValues<T> & string>;
					},
					trx?: Transaction<DB>,
				): Promise<InsertResult<T>>;
			}
		: unknown);

type CrudOps<T extends TableName> =
	IsView<T> extends true ? ReadOps<T> : ReadOps<T> & WriteOps<T>;

function applyWhere(query: any, table: string, where: Record<string, unknown>) {
	let result = query;
	for (const [column, value] of Object.entries(where)) {
		if (value === undefined) continue;

		result =
			value === null
				? result.where(`${table}.${column}`, "is", null)
				: result.where(`${table}.${column}`, "=", value);
	}

	return result;
}

interface CompiledShape {
	sql: string;
	query: RootOperationNode;
}

interface Shape {
	shape: string;
	parameters: unknown[];
}

/** An equality filter's columns (`null` compiling to `is null`) and its parameters, `null` when a value compiles into the SQL. */
function filterShape(where: Record<string, unknown>): Shape | null {
	const columns: string[] = [];
	const parameters: unknown[] = [];
	for (const [column, value] of Object.entries(where)) {
		if (value === undefined) continue;
		if (value === null) {
			columns.push(`${column} is null`);
			continue;
		}
		// a list compiles to `in (?, ?, ...)`, one parameter per item
		if (Array.isArray(value) || !isBoundValue(value)) return null;

		columns.push(column);
		parameters.push(value);
	}

	return { shape: columns.join(","), parameters };
}

/** Written columns and their values, `null` when a value compiles into the SQL. */
function valuesShape(values: Record<string, unknown>): Shape | null {
	const columns: string[] = [];
	const parameters: unknown[] = [];
	for (const [column, value] of Object.entries(values)) {
		if (value === undefined) continue;
		if (!isBoundValue(value)) return null;

		columns.push(column);
		parameters.push(value);
	}

	return { shape: columns.join(","), parameters };
}

/** Whether Kysely binds the value as a parameter rather than compiling it into the SQL (an expression, a subquery). */
function isBoundValue(value: unknown) {
	if (typeof value === "function") return false;
	return !(
		typeof value === "object" &&
		value !== null &&
		typeof (value as { toOperationNode?: unknown }).toOperationNode ===
			"function"
	);
}

function sameParameters(
	compiled: ReadonlyArray<unknown>,
	parameters: ReadonlyArray<unknown>,
) {
	return (
		compiled.length === parameters.length &&
		compiled.every((parameter, i) => parameter === parameters[i])
	);
}

function assertNotEmpty(where: Record<string, unknown>, operation: string) {
	if (Object.values(where).every((value) => value === undefined)) {
		throw new Error(`crud ${operation} called without a where filter`);
	}
}
