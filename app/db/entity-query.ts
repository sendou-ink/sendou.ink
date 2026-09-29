import {
	type AnyColumnWithTable,
	type CompiledQuery,
	type Expression,
	type ExpressionBuilder,
	type OrderByDirection,
	type SelectQueryBuilder,
	type Simplify,
	type SqlBool,
	sql,
} from "kysely";
import { jsonBuildObject } from "~/utils/kysely.server";
import { SCHEMA } from "./schema.gen";
import type { ColumnFilter, TableName } from "./schema-types";
import { db } from "./sql";
import type { DB } from "./tables";

type AnyQB = SelectQueryBuilder<any, any, any>;
type AnyEB = ExpressionBuilder<any, any>;
type NoFields = Record<never, never>;
type RootQB<R extends TableName> = SelectQueryBuilder<DB, R, NoFields>;
type Override<O, A> = Simplify<Omit<O, keyof A> & A>;
type SortTarget = string | ((eb: AnyEB) => Expression<unknown>);
type SortKey = readonly [SortTarget, OrderByDirection];
type CursorValue = string | number;
type Row = Record<string, unknown>;
type ResolveLoad = (keys: number[]) => Promise<Map<number, unknown>>;

const RESOLVE_MARKER = "__resolve";
const resolveLoads = new Map<string, ResolveLoad>();

/**
 * Sort key computed from the root's columns, e.g. `(eb) => eb("LFGPost.authorId", "=", id)` to
 * put the actor's rows first. Like a column key it must never be `null`, or cursors skip rows.
 */
type SortExpression<DBT, TB extends keyof DBT> = (
	eb: ExpressionBuilder<DBT, TB>,
) => Expression<unknown>;

/**
 * One chain step: SQL refinement, sort keys, lifted guards and/or row mapping, only valid on
 * chains rooted at `R`. `Added` is what it adds to the row, `Requires` what a mapper reads and
 * `Mapped` the keys a mapper writes.
 */
export interface Modifier<
	R extends TableName,
	Added = NoFields,
	Requires = unknown,
	Mapped extends PropertyKey = never,
> {
	readonly apply?: (qb: AnyQB) => AnyQB;
	readonly sortKeys?: ReadonlyArray<SortKey>;
	readonly lifts?: ReadonlyArray<string>;
	readonly map?: (row: any) => Record<string, unknown>;
	readonly __types?: {
		root: R;
		added: Added;
		requires: Requires;
		mapped: Mapped;
	};
}

type Refinement<R extends TableName, B extends AnyQB> = Modifier<
	R,
	SelectedOf<B>
> & {
	/** Sort keys of the step, stacking in call order with other steps' keys. May reference the step's own joins. */
	sortedBy(
		...keys: Array<readonly [SortableColumn<B>, OrderByDirection]>
	): Modifier<R, SelectedOf<B>>;
};

type SelectedOf<B> =
	B extends SelectQueryBuilder<any, any, infer O> ? O : never;
type SortableColumn<B> =
	B extends SelectQueryBuilder<infer D, infer TB, any>
		? AnyColumnWithTable<D, TB> | SortExpression<D, TB>
		: never;

/**
 * Step from plain Kysely, only the root table in scope. Whatever it selects is inferred as the
 * fields it adds. Filters and joins are fine; sorting goes through `.sortedBy(...)`, a raw
 * `orderBy` throws when the chain compiles.
 */
export function refine<R extends TableName, B extends AnyQB>(
	_root: R,
	apply: (qb: RootQB<R>) => B,
): Refinement<R, B> {
	return {
		apply: apply as (qb: AnyQB) => AnyQB,
		sortedBy: (...keys) => ({
			apply: apply as (qb: AnyQB) => AnyQB,
			sortKeys: keys,
		}),
	};
}

/** Step that only sorts. Keys stack in call order, like Kysely's `orderBy`. */
export function sortedBy<R extends TableName>(
	_root: R,
	...keys: Array<
		readonly [
			AnyColumnWithTable<DB, R> | SortExpression<DB, R>,
			OrderByDirection,
		]
	>
): Modifier<R> {
	return { sortKeys: keys };
}

/** Step mapping each row in JS after the query ran. Its return value is merged into the row. */
export function mapRows<
	R extends TableName,
	In,
	Out extends Record<string, unknown>,
>(_root: R, map: (row: In) => Out): Modifier<R, Out, In, keyof Out> {
	return { map: map as (row: any) => Out };
}

/** Step that leaves the chain as is, for vocabulary words whose filter is switched off. */
export function unchanged<R extends TableName>(_root: R): Modifier<R> {
	return {};
}

/**
 * A value the query can't produce by itself (in-memory caches, per-viewer data), selected like
 * any expression: `cardOf(eb.ref("User.id")).as("card")`, nested JSON included. After the query
 * ran, the chain loads every key of the rows with one `load` call per resolver and puts the
 * value in place, `null` when the key is `null` or `load` has none. Mappers see resolved values.
 */
export function defineResolver<V>(
	name: string,
	load: (keys: number[]) => Promise<Map<number, V>>,
) {
	resolveLoads.set(name, load);

	return (key: Expression<number | null>) =>
		jsonBuildObject({
			[RESOLVE_MARKER]: sql.lit(name),
			key,
		}).$castTo<V | null>();
}

type Vocabulary<R extends TableName> = Record<
	string,
	(...args: any[]) => Modifier<R, any, any, any>
>;

type Step<R extends TableName, O, V, M extends PropertyKey, Mod> =
	Mod extends Modifier<R, infer A, infer Req, infer Mk>
		? O extends Req
			? [Mk & M] extends [never]
				? Chain<R, Override<O, A>, V, M | Mk>
				: never
			: never
		: never;

interface EntityQuery<R extends TableName, O, V, M extends PropertyKey> {
	/** Equality filter on root columns, `null` meaning `is null`. */
	where(filter: ColumnFilter<R>): Chain<R, O, V, M>;
	/** Adds a one-off step. The second time the same step is needed, it moves into the vocabulary. */
	with<Mod extends Modifier<R, any, any, any>>(
		modifier: Mod,
	): Step<R, O, V, M, Mod>;
	limit(count: number): Chain<R, O, V, M>;
	/**
	 * Numbered pages in the chain's sort order, the root's `id` breaking ties. With `containing`,
	 * the page holding that row is served instead of `page`, when the row is in the result.
	 */
	paginate(options: PageOptions): Promise<Page<O>>;
	/**
	 * Pages after an opaque cursor from a previous page's `nextCursor`. A missing, tampered or
	 * stale cursor serves the first page.
	 */
	paginate(options: CursorOptions): Promise<CursorPage<O>>;
	execute(): Promise<O[]>;
	executeTakeFirst(): Promise<O | undefined>;
	compile(): CompiledQuery;
}

interface PageOptions {
	/** 1-based. */
	page: number;
	size: number;
	containing?: number | null;
}

interface Page<O> {
	items: O[];
	currentPage: number;
	pagesCount: number;
	totalCount: number;
}

interface CursorOptions {
	after: string | null;
	size: number;
}

interface CursorPage<O> {
	items: O[];
	nextCursor: string | null;
}

export type Chain<
	R extends TableName,
	O,
	V,
	M extends PropertyKey = never,
> = EntityQuery<R, O, V, M> & {
	[K in keyof V]: V[K] extends (...args: infer P) => infer Mod
		? (...args: P) => Step<R, O, V, M, Mod>
		: never;
};

/** The row type a chain resolves to. */
export type QueryRow<C> =
	C extends EntityQuery<any, infer O, any, any> ? O : never;

interface QueryDefinition<
	R extends TableName,
	S,
	MO extends Record<string, unknown>,
	G extends string,
	V extends Vocabulary<R>,
> {
	root: R;
	/** The base shape: what the entity means everywhere. */
	select: (qb: RootQB<R>) => SelectQueryBuilder<any, any, S>;
	/** Runs on every row, before the steps' mappers. */
	map?: (row: S) => MO;
	/** Used only when no step sorts. */
	defaultSort?: Array<readonly [AnyColumnWithTable<DB, R>, OrderByDirection]>;
	/** Filters applied when the chain compiles unless a step lifts them, so a forgotten step fails closed. */
	guards?: Record<G, (qb: RootQB<R>) => RootQB<R>>;
	vocabulary?: (helpers: {
		/** Step lifting a guard, optionally replacing it with a filter of its own. */
		lift: (guard: G, apply?: (qb: RootQB<R>) => AnyQB) => Modifier<R>;
	}) => V;
}

/**
 * Defines an entity's composable read: the base shape plus a vocabulary of named steps. Returns
 * a function starting a new chain; steps apply in a fixed phase order when it compiles (guards
 * and filters, selections, sort, limit, resolvers, mappers), so call order only matters for sort keys.
 */
export function defineQuery<
	R extends TableName,
	S,
	MO extends Record<string, unknown> = NoFields,
	G extends string = never,
	V extends Vocabulary<R> = NoFields,
>(
	definition: QueryDefinition<R, S, MO, G, V>,
): () => Chain<R, Override<S, MO>, V> {
	const vocabulary =
		definition.vocabulary?.({
			lift: (guard, apply) => ({
				lifts: [guard],
				apply: apply as ((qb: AnyQB) => AnyQB) | undefined,
			}),
		}) ?? {};

	return () =>
		createChain(definition as unknown as AnyDefinition, vocabulary, {
			steps: [],
			filters: [],
			limit: undefined,
		}) as Chain<R, Override<S, MO>, V>;
}

interface AnyDefinition {
	root: string;
	select: (qb: AnyQB) => AnyQB;
	map?: (row: any) => Record<string, unknown>;
	defaultSort?: ReadonlyArray<SortKey>;
	guards?: Record<string, (qb: AnyQB) => AnyQB>;
}

interface ChainState {
	steps: ReadonlyArray<Modifier<any, any, any, any>>;
	filters: ReadonlyArray<Record<string, unknown>>;
	limit: number | undefined;
}

function createChain(
	definition: AnyDefinition,
	vocabulary: Vocabulary<any>,
	state: ChainState,
) {
	const next = (patch: Partial<ChainState>) =>
		createChain(definition, vocabulary, { ...state, ...patch });
	const addStep = (step: Modifier<any, any, any, any>) =>
		next({ steps: [...state.steps, step] });

	const idRef = `${definition.root}.id`;

	// `selectionsOnly` builds only what the rows show, for ids that already passed the filters:
	// guards, `where` filters and steps selecting nothing (filters, sort joins) are left out
	const unsorted = ({ selectionsOnly = false } = {}) => {
		let qb: AnyQB = (db as unknown as SelectFromAny).selectFrom(
			definition.root,
		);

		const lifted = new Set(state.steps.flatMap((step) => step.lifts ?? []));
		for (const [name, guard] of Object.entries(definition.guards ?? {})) {
			if (!selectionsOnly && !lifted.has(name)) qb = guard(qb);
		}

		for (const filter of selectionsOnly ? [] : state.filters) {
			for (const [column, value] of Object.entries(filter)) {
				if (value === undefined) continue;
				const ref = `${definition.root}.${column}`;
				qb =
					value === null
						? qb.where(ref, "is", null)
						: qb.where(ref, "=", value);
			}
		}

		for (const step of state.steps) {
			if (!step.apply) continue;

			const applied = applyWithoutOrderBy(qb, step.apply);
			if (!selectionsOnly || addsSelections(qb, applied)) qb = applied;
		}

		return definition.select(qb);
	};

	const sortKeys = () => {
		const stepSortKeys = state.steps.flatMap((step) => step.sortKeys ?? []);
		return stepSortKeys.length > 0
			? stepSortKeys
			: (definition.defaultSort ?? []);
	};

	const build = (limit = state.limit) => {
		const qb = orderByKeys(unsorted(), sortKeys());

		return typeof limit === "number" ? qb.limit(limit) : qb;
	};

	const mapRow = (row: Row) => {
		let result = definition.map ? { ...row, ...definition.map(row) } : row;
		for (const step of state.steps) {
			if (step.map) result = { ...result, ...step.map(result) };
		}
		return result;
	};

	const run = async (qb: AnyQB) => {
		const compiled = qb.compile();
		const { rows } = await db.executeQuery<Row>(compiled);

		return (await resolveRows(rows, compiled.sql)).map(mapRow);
	};

	// total order for paging: the id breaks ties so every row has exactly one position
	const pageKeys = (): SortKey[] => {
		if (!hasIdPrimaryKey(definition.root)) {
			throw new Error(
				`paginate needs a single "id" primary key, "${definition.root}" has none`,
			);
		}

		const keys = sortKeys();
		return keys.at(-1)?.[0] === idRef ? [...keys] : [...keys, [idRef, "asc"]];
	};

	// phase 1: filters, sort and seek only, selecting the id and the sort key values
	const keyQuery = (keys: ReadonlyArray<SortKey>) =>
		unsorted()
			.clearSelect()
			.select((eb: AnyEB) => [
				eb.ref(idRef).as("__id"),
				...keys.map(([target], i) =>
					sql`${sortExpression(eb, target)}`.as(`__key${i}`),
				),
			]);

	// phase 2: the full rows of one page, in phase 1's order
	const rowsByIds = async (ids: number[]) => {
		if (ids.length === 0) return [];

		return run(
			unsorted({ selectionsOnly: true })
				.innerJoin(
					sql`json_each(${JSON.stringify(ids)})`.as("__page"),
					(join) => join.onRef("__page.value", "=", idRef),
				)
				.orderBy("__page.key"),
		);
	};

	const paginateByPage = async ({ page, size, containing }: PageOptions) => {
		const keys = pageKeys();

		let currentPage = page;
		if (typeof containing === "number") {
			const target = await keyQuery(keys)
				.where(idRef, "=", containing)
				.executeTakeFirst();

			if (target) {
				const rowsBefore = await countRows(
					keyQuery(keys).where((eb: AnyEB) =>
						seek(eb, keys, keyValuesOf(target, keys), "before"),
					),
				);
				currentPage = Math.floor(rowsBefore / size) + 1;
			}
		}

		// the total rides along the page's ids, only a page past a non-empty result's end needs its own count
		const idRows: Array<{ __id: number; __total: number }> = await orderByKeys(
			keyQuery(keys).select((eb: AnyEB) =>
				eb.fn.countAll().over().as("__total"),
			),
			keys,
		)
			.limit(size)
			.offset((currentPage - 1) * size)
			.execute();
		const totalCount =
			idRows[0]?.__total ??
			(currentPage === 1 ? 0 : await countRows(keyQuery(keys)));

		return {
			items: await rowsByIds(idRows.map((row) => row.__id)),
			currentPage,
			pagesCount: Math.max(1, Math.ceil(totalCount / size)),
			totalCount,
		};
	};

	const paginateByCursor = async ({ after, size }: CursorOptions) => {
		const keys = pageKeys();
		const cursor = decodeCursor(after, keys.length);

		let query = keyQuery(keys);
		if (cursor) {
			query = query.where((eb: AnyEB) => seek(eb, keys, cursor, "after"));
		}

		const idRows = await orderByKeys(query, keys)
			.limit(size + 1)
			.execute();
		const pageRows = idRows.slice(0, size);
		const lastRow = pageRows.at(-1);

		return {
			items: await rowsByIds(pageRows.map((row: { __id: number }) => row.__id)),
			nextCursor:
				idRows.length > size && lastRow
					? encodeCursor(keyValuesOf(lastRow, keys))
					: null,
		};
	};

	const chain: Record<string, unknown> = {
		where: (filter: Record<string, unknown>) =>
			next({ filters: [...state.filters, filter] }),
		with: addStep,
		limit: (count: number) => next({ limit: count }),
		paginate: (options: PageOptions | CursorOptions) =>
			"after" in options ? paginateByCursor(options) : paginateByPage(options),
		compile: () => build().compile(),
		execute: () => run(build()),
		executeTakeFirst: async () => (await run(build(1)))[0],
	};

	for (const [name, factory] of Object.entries(vocabulary)) {
		chain[name] = (...args: unknown[]) => addStep(factory(...args));
	}

	return chain;
}

interface SelectFromAny {
	selectFrom(table: unknown): AnyQB;
}

async function resolveRows(rows: Row[], compiledSql: string) {
	if (!compiledSql.includes(`'${RESOLVE_MARKER}'`)) return rows;

	const slots: ResolveSlot[] = [];
	for (const row of rows) collectResolveSlots(row, slots);

	const keysByResolver = new Map<string, Set<number>>();
	for (const { marker } of slots) {
		const name = marker[RESOLVE_MARKER];
		const keys = keysByResolver.get(name) ?? new Set();
		keysByResolver.set(name, keys);
		if (typeof marker.key === "number") keys.add(marker.key);
	}

	const loaded = new Map(
		await Promise.all(
			[...keysByResolver].map(async ([name, keys]) => {
				const load = resolveLoads.get(name);
				if (!load) throw new Error(`No resolver named "${name}"`);

				return [name, await load([...keys])] as const;
			}),
		),
	);

	// the rows are fresh from the driver, so markers are replaced in place; every place a key
	// appears gets the same value, which the loader payload then serializes once
	for (const { container, field, marker } of slots) {
		container[field] =
			typeof marker.key === "number"
				? (loaded.get(marker[RESOLVE_MARKER])?.get(marker.key) ?? null)
				: null;
	}

	return rows;
}

type Container = Record<PropertyKey, unknown>;

interface ResolveMarker {
	[RESOLVE_MARKER]: string;
	key: number | null;
}

interface ResolveSlot {
	container: Container;
	field: PropertyKey;
	marker: ResolveMarker;
}

function collectResolveSlots(value: object, slots: ResolveSlot[]) {
	const container = value as Container;
	const fields = Array.isArray(value) ? value.keys() : Object.keys(value);

	for (const field of fields) {
		visitResolveSlot(container, field, container[field], slots);
	}
}

function visitResolveSlot(
	container: Container,
	field: PropertyKey,
	value: unknown,
	slots: ResolveSlot[],
) {
	if (typeof value !== "object" || value === null) return;

	if (RESOLVE_MARKER in value) {
		slots.push({ container, field, marker: value as ResolveMarker });
	} else if (
		Array.isArray(value) ||
		Object.getPrototypeOf(value) === Object.prototype
	) {
		collectResolveSlots(value, slots);
	}
}

function sortExpression(eb: AnyEB, target: SortTarget): Expression<unknown> {
	// parenthesized so a comparison key like `a = ?` keeps its meaning inside `a = ? < ?`
	return typeof target === "string" ? eb.ref(target) : sql`(${target(eb)})`;
}

function orderByKeys(qb: AnyQB, keys: ReadonlyArray<SortKey>) {
	let result = qb;
	for (const [target, direction] of keys) {
		result = result.orderBy(
			(eb: AnyEB) => sortExpression(eb, target),
			direction,
		);
	}
	return result;
}

/**
 * Rows sorting strictly after (or before) the given key values, expanded so each key keeps its
 * own direction: `(a > x) or (a = x and b < y) or (a = x and b = y and id > z)`.
 */
function seek(
	eb: AnyEB,
	keys: ReadonlyArray<SortKey>,
	values: ReadonlyArray<CursorValue>,
	side: "after" | "before",
): Expression<SqlBool> {
	return eb.or(
		keys.map(([target, direction], i) =>
			eb.and([
				...keys
					.slice(0, i)
					.map(([previous], j) =>
						eb(sortExpression(eb, previous), "=", values[j]),
					),
				eb(
					sortExpression(eb, target),
					(direction === "asc") === (side === "after") ? ">" : "<",
					values[i],
				),
			]),
		),
	);
}

async function countRows(query: AnyQB) {
	const { count } = await (db as unknown as SelectFromAny)
		.selectFrom(query.as("__counted"))
		.select((eb: AnyEB) => eb.fn.countAll<number>().as("count"))
		.executeTakeFirstOrThrow();

	return count;
}

function keyValuesOf(
	row: Record<string, unknown>,
	keys: ReadonlyArray<SortKey>,
): CursorValue[] {
	return keys.map((_, i) => row[`__key${i}`] as CursorValue);
}

function hasIdPrimaryKey(table: string) {
	const primaryKey: ReadonlyArray<string> | undefined = (
		SCHEMA as Record<string, { primaryKey: ReadonlyArray<string> }>
	)[table]?.primaryKey;

	return primaryKey?.length === 1 && primaryKey[0] === "id";
}

function encodeCursor(values: CursorValue[]) {
	return Buffer.from(JSON.stringify(values)).toString("base64url");
}

function decodeCursor(
	cursor: string | null,
	keyCount: number,
): CursorValue[] | null {
	if (!cursor) return null;

	try {
		const values: unknown = JSON.parse(
			Buffer.from(cursor, "base64url").toString(),
		);
		if (
			Array.isArray(values) &&
			values.length === keyCount &&
			values.every(
				(value) =>
					typeof value === "string" ||
					(typeof value === "number" && Number.isFinite(value)),
			)
		) {
			return values;
		}
	} catch {
		// tampered cursors serve the first page
	}

	return null;
}

function addsSelections(before: AnyQB, after: AnyQB) {
	return (
		after.toOperationNode().selections !== before.toOperationNode().selections
	);
}

function applyWithoutOrderBy(qb: AnyQB, apply: (qb: AnyQB) => AnyQB) {
	const before = qb.toOperationNode().orderBy;
	const result = apply(qb);
	if (result.toOperationNode().orderBy !== before) {
		throw new Error(
			"A chain step sorted with orderBy, sort through sortedBy(...) instead",
		);
	}
	return result;
}
