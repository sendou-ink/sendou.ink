import {
	type AnyColumnWithTable,
	type CompiledQuery,
	type Expression,
	type ExpressionBuilder,
	type OperationNodeSource,
	type OrderByDirection,
	type SelectExpression,
	type SelectQueryBuilder,
	type SelectQueryNode,
	type Simplify,
	type SqlBool,
	sql,
} from "kysely";
import { actorReadCount } from "~/features/auth/core/actor-reads.server";
import { jsonBuildObject } from "~/utils/kysely.server";
import { SCHEMA } from "./schema.gen";
import type {
	ColumnFilter,
	HasIdPrimaryKey,
	TableName,
	Row as TableRow,
} from "./schema-types";
import { db } from "./sql";
import type { DB } from "./tables";

type AnyQB = SelectQueryBuilder<any, any, any>;
type AnyEB = ExpressionBuilder<any, any>;
type NoFields = Record<never, never>;
type RootQB<R extends TableName> = SelectQueryBuilder<DB, R, NoFields>;
type Override<O, A> = Simplify<Omit<O, keyof A> & A>;
type SortTarget = string | ((eb: AnyEB) => Expression<unknown>);
type SortKey = readonly [SortTarget, OrderByDirection];
type CursorValue = string | number | Date;
type Row = Record<string, unknown>;
type ResolveLoad = (keys: number[]) => Promise<Map<number, unknown>>;

const RESOLVE_MARKER = "__resolve";
const BASE_SELECT_KEY = "__base";
// bounds the memo of a definition whose selection steps take arguments with many values (ids); past it, new keys are built per chain
const MEMOIZED_STEPS_LIMIT = 1000;
const VERIFIES_MEMOIZED_SELECTIONS = process.env.NODE_ENV !== "production";
const CLOCK_SHIFT_MS = 24 * 60 * 60 * 1000;
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
	/** Identifies a step whose selections depend only on this key, so they are built once. Vocabulary words get one from their name and arguments. */
	readonly memoKey?: string;
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
	/** Rows whose `id` is one of `ids`, an empty list matching none. Needs a single `id` primary key. */
	whereIdIn: HasIdPrimaryKey<R> extends true
		? (ids: ReadonlyArray<number>) => Chain<R, O, V, M>
		: never;
	/** Adds plain root columns to the row, offering only those not on it yet. */
	withColumns<const C extends Exclude<keyof TableRow<R> & string, keyof O>>(
		columns: ReadonlyArray<C>,
	): Chain<R, Override<O, Pick<TableRow<R>, C>>, V, M>;
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
	/** How many rows the chain's guards and filters let through; selections, sort and `limit` don't apply. */
	count(): Promise<number>;
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
 *
 * The selections of the base shape and of steps that only select are built once and reused by
 * every chain, keyed by the vocabulary word and its arguments. A step reading the actor or the
 * clock is detected and built per chain instead; anything else that varies (the current season,
 * a setting) goes in as an argument or into a filter. Outside production every reuse is checked
 * against a fresh build, which throws on a violation.
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
	const runtime = new QueryRuntime(
		definition as unknown as AnyDefinition,
		vocabulary,
	);

	return () => runtime.start() as unknown as Chain<R, Override<S, MO>, V>;
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

const EMPTY_STATE: ChainState = { steps: [], filters: [], limit: undefined };

/**
 * What a build of the chain is for: `rows` is the full query, `selectionsOnly` only what the rows
 * show for ids that already passed the filters (guards, `where` filters and steps selecting
 * nothing are left out), `filtersOnly` only what decides which rows match, its selections dropped.
 */
type BuildMode = "rows" | "selectionsOnly" | "filtersOnly";

/** A step's selections, built once, ready to splice into another chain's `select`. */
type MemoizedSelections = ReadonlyArray<OperationNodeSource>;

/** Per definition: the chain class carrying the vocabulary as methods, and the memoized selections. */
class QueryRuntime {
	readonly definition: AnyDefinition;
	readonly idRef: string;
	readonly baseStep: Modifier<any>;
	readonly #Chain: new (
		runtime: QueryRuntime,
		state: ChainState,
	) => ChainImpl;
	readonly #memoizedSelections = new Map<string, MemoizedSelections>();
	// a word that filters, joins or reads the actor or the clock does so whatever its arguments
	readonly #unmemoizableWords = new Set<string>();

	constructor(definition: AnyDefinition, vocabulary: Vocabulary<any>) {
		this.definition = definition;
		this.idRef = `${definition.root}.id`;
		this.baseStep = { apply: definition.select, memoKey: BASE_SELECT_KEY };

		class VocabularyChain extends ChainImpl {}
		for (const [name, factory] of Object.entries(vocabulary)) {
			Object.defineProperty(VocabularyChain.prototype, name, {
				value(this: ChainImpl, ...args: unknown[]) {
					return this.addStep(vocabularyStep(name, factory, args));
				},
			});
		}
		this.#Chain = VocabularyChain;
	}

	start() {
		return this.chain(EMPTY_STATE);
	}

	chain(state: ChainState) {
		return new this.#Chain(this, state);
	}

	selectFrom(): AnyQB {
		return (db as unknown as SelectFromAny).selectFrom(this.definition.root);
	}

	/** The step's selections when it only selects, built the first time it is seen. */
	memoizedSelectionsOf(
		step: Modifier<any, any, any, any>,
	): MemoizedSelections | null {
		if (!step.memoKey || !step.apply) return null;

		const known = this.#memoizedSelections.get(step.memoKey);
		if (known) {
			if (VERIFIES_MEMOIZED_SELECTIONS) {
				this.#assertStillBuilds(step.memoKey, step.apply, known);
			}
			return known;
		}

		const word = memoKeyWord(step.memoKey);
		if (
			this.#unmemoizableWords.has(word) ||
			this.#memoizedSelections.size >= MEMOIZED_STEPS_LIMIT
		) {
			return null;
		}

		const memoized = this.#memoize(step.apply);
		if (memoized) {
			this.#memoizedSelections.set(step.memoKey, memoized);
		} else {
			this.#unmemoizableWords.add(word);
		}
		return memoized;
	}

	// a step reading the actor or the clock builds different SQL per chain, so it's never memoized
	#memoize(apply: (qb: AnyQB) => AnyQB) {
		const readsBefore = actorReadCount();
		const blank = this.selectFrom();
		const applied = apply(blank);
		const selections = selectionsAdded(blank, applied);
		if (!selections || actorReadCount() !== readsBefore) return null;

		const readsClock = !sameQuery(
			applied,
			withShiftedClock(() => apply(this.selectFrom())),
		);
		return readsClock ? null : selections;
	}

	#assertStillBuilds(
		key: string,
		apply: (qb: AnyQB) => AnyQB,
		memoized: MemoizedSelections,
	) {
		if (
			!sameQuery(
				selectMemoized(this.selectFrom(), memoized),
				apply(this.selectFrom()),
			)
		) {
			throw new Error(
				`The "${key}" step of "${this.definition.root}" built different selections than the memoized ones: they may depend only on its arguments, the actor and the clock. Pass anything else that varies (a season, a setting) as an argument.`,
			);
		}
	}
}

class ChainImpl {
	readonly #runtime: QueryRuntime;
	readonly #state: ChainState;

	constructor(runtime: QueryRuntime, state: ChainState) {
		this.#runtime = runtime;
		this.#state = state;
	}

	addStep(step: Modifier<any, any, any, any>) {
		return this.#next({ steps: [...this.#state.steps, step] });
	}

	where(filter: Record<string, unknown>) {
		return this.#next({ filters: [...this.#state.filters, filter] });
	}

	whereIdIn(ids: ReadonlyArray<number>) {
		this.#assertIdPrimaryKey("whereIdIn");
		const { idRef } = this.#runtime;
		return this.addStep({ apply: (qb) => qb.where(idRef, "in", ids) });
	}

	withColumns(columns: ReadonlyArray<string>) {
		const { root } = this.#runtime.definition;
		return this.addStep({
			apply: (qb) => qb.select(columns.map((column) => `${root}.${column}`)),
			memoKey: `withColumns(${columns.join(",")})`,
		});
	}

	with(step: Modifier<any, any, any, any>) {
		return this.addStep(step);
	}

	limit(count: number) {
		return this.#next({ limit: count });
	}

	paginate(options: PageOptions | CursorOptions) {
		return "after" in options
			? this.#paginateByCursor(options)
			: this.#paginateByPage(options);
	}

	compile() {
		return this.#build().compile();
	}

	execute() {
		return this.#run(this.#build());
	}

	async executeTakeFirst() {
		return (await this.#run(this.#build(1)))[0];
	}

	count() {
		return countRows(
			this.#unsorted("filtersOnly")
				.clearSelect()
				.select((eb: AnyEB) => eb.lit(1).as("__counted")),
		);
	}

	#next(patch: Partial<ChainState>) {
		return this.#runtime.chain({ ...this.#state, ...patch });
	}

	#unsorted(mode: BuildMode = "rows") {
		const runtime = this.#runtime;
		const { definition } = runtime;
		let qb = runtime.selectFrom();

		if (mode !== "selectionsOnly") {
			const lifted = new Set(
				this.#state.steps.flatMap((step) => step.lifts ?? []),
			);
			for (const [name, guard] of Object.entries(definition.guards ?? {})) {
				if (!lifted.has(name)) qb = guard(qb);
			}

			for (const filter of this.#state.filters) {
				for (const [column, value] of Object.entries(filter)) {
					if (value === undefined) continue;
					const ref = `${definition.root}.${column}`;
					qb =
						value === null
							? qb.where(ref, "is", null)
							: qb.where(ref, "=", value);
				}
			}
		}

		for (const step of this.#state.steps) {
			if (!step.apply) continue;

			const memoized = runtime.memoizedSelectionsOf(step);
			if (memoized) {
				if (mode !== "filtersOnly") qb = selectMemoized(qb, memoized);
				continue;
			}

			const applied = applyWithoutOrderBy(qb, step.apply);
			if (mode !== "selectionsOnly" || addsSelections(qb, applied)) {
				qb = applied;
			}
		}

		const base = runtime.memoizedSelectionsOf(runtime.baseStep);
		if (!base) return definition.select(qb);

		return mode === "filtersOnly" ? qb : selectMemoized(qb, base);
	}

	#sortKeys() {
		const stepSortKeys = this.#state.steps.flatMap(
			(step) => step.sortKeys ?? [],
		);
		return stepSortKeys.length > 0
			? stepSortKeys
			: (this.#runtime.definition.defaultSort ?? []);
	}

	#build(limit = this.#state.limit) {
		const qb = orderByKeys(this.#unsorted(), this.#sortKeys());

		return typeof limit === "number" ? qb.limit(limit) : qb;
	}

	// rows are fresh from the driver, so mappers write into them in place
	#mapRow(row: Row) {
		const { map } = this.#runtime.definition;
		if (map) Object.assign(row, map(row));
		for (const step of this.#state.steps) {
			if (step.map) Object.assign(row, step.map(row));
		}
		return row;
	}

	async #run(qb: AnyQB) {
		const compiled = qb.compile();
		const { rows } = await db.executeQuery<Row>(compiled);

		return (await resolveRows(rows, compiled.sql)).map((row) =>
			this.#mapRow(row),
		);
	}

	// total order for paging: the id breaks ties so every row has exactly one position
	#assertIdPrimaryKey(operation: string) {
		const { root } = this.#runtime.definition;
		if (!hasIdPrimaryKey(root)) {
			throw new Error(
				`${operation} needs a single "id" primary key, "${root}" has none`,
			);
		}
	}

	#pageKeys(): SortKey[] {
		this.#assertIdPrimaryKey("paginate");

		const { idRef } = this.#runtime;
		const keys = this.#sortKeys();
		return keys.at(-1)?.[0] === idRef ? [...keys] : [...keys, [idRef, "asc"]];
	}

	// phase 1: filters, sort and seek only, selecting the id and the sort key values
	#keyQuery(keys: ReadonlyArray<SortKey>) {
		const { idRef } = this.#runtime;
		return this.#unsorted("filtersOnly")
			.clearSelect()
			.select((eb: AnyEB) => [
				eb.ref(idRef).as("__id"),
				...keys.map(([target], i) =>
					sql`${sortExpression(eb, target)}`.as(`__key${i}`),
				),
			]);
	}

	// phase 2: the full rows of one page, in phase 1's order
	async #rowsByIds(ids: number[]) {
		if (ids.length === 0) return [];

		return this.#run(
			this.#unsorted("selectionsOnly")
				.innerJoin(
					sql`json_each(${JSON.stringify(ids)})`.as("__page"),
					(join) => join.onRef("__page.value", "=", this.#runtime.idRef),
				)
				.orderBy("__page.key"),
		);
	}

	async #paginateByPage({ page, size, containing }: PageOptions) {
		const keys = this.#pageKeys();

		let currentPage = page;
		if (typeof containing === "number") {
			const target = await this.#keyQuery(keys)
				.where(this.#runtime.idRef, "=", containing)
				.executeTakeFirst();

			if (target) {
				const rowsBefore = await countRows(
					this.#keyQuery(keys).where((eb: AnyEB) =>
						seek(eb, keys, keyValuesOf(target, keys), "before"),
					),
				);
				currentPage = Math.floor(rowsBefore / size) + 1;
			}
		}

		// the total rides along the page's ids, only a page past a non-empty result's end needs its own count
		const idRows: Array<{ __id: number; __total: number }> = await orderByKeys(
			this.#keyQuery(keys).select((eb: AnyEB) =>
				eb.fn.countAll().over().as("__total"),
			),
			keys,
		)
			.limit(size)
			.offset((currentPage - 1) * size)
			.execute();
		const totalCount =
			idRows[0]?.__total ??
			(currentPage === 1 ? 0 : await countRows(this.#keyQuery(keys)));

		return {
			items: await this.#rowsByIds(idRows.map((row) => row.__id)),
			currentPage,
			pagesCount: Math.max(1, Math.ceil(totalCount / size)),
			totalCount,
		};
	}

	async #paginateByCursor({ after, size }: CursorOptions) {
		const keys = this.#pageKeys();
		const cursor = decodeCursor(after, keys.length);

		let query = this.#keyQuery(keys);
		if (cursor) {
			query = query.where((eb: AnyEB) => seek(eb, keys, cursor, "after"));
		}

		const idRows = await orderByKeys(query, keys)
			.limit(size + 1)
			.execute();
		const pageRows = idRows.slice(0, size);
		const lastRow = pageRows.at(-1);

		return {
			items: await this.#rowsByIds(
				pageRows.map((row: { __id: number }) => row.__id),
			),
			nextCursor:
				idRows.length > size && lastRow
					? encodeCursor(keyValuesOf(lastRow, keys))
					: null,
		};
	}
}

/** A vocabulary word's step, keyed for memoizing by the word and its arguments unless building it read the actor. */
function vocabularyStep(
	name: string,
	factory: (...args: any[]) => Modifier<any, any, any, any>,
	args: unknown[],
) {
	const readsBefore = actorReadCount();
	const step = factory(...args);
	if (step.memoKey || !step.apply || actorReadCount() !== readsBefore) {
		return step;
	}

	const key = argumentsKey(args);
	return key === null ? step : { ...step, memoKey: `${name}(${key})` };
}

/** The vocabulary word or helper a memo key belongs to: `forWeapon` of `forWeapon(40)`. */
function memoKeyWord(memoKey: string) {
	const argumentsStart = memoKey.indexOf("(");
	return argumentsStart === -1 ? memoKey : memoKey.slice(0, argumentsStart);
}

/** Arguments as a key, `null` when one isn't a primitive or a list of them. */
function argumentsKey(args: ReadonlyArray<unknown>): string | null {
	const parts: string[] = [];
	for (const arg of args) {
		const part = Array.isArray(arg) ? argumentsKey(arg) : primitiveKey(arg);
		if (part === null) return null;
		parts.push(Array.isArray(arg) ? `[${part}]` : part);
	}

	return parts.join(",");
}

function primitiveKey(value: unknown) {
	if (typeof value === "string") return JSON.stringify(value);
	if (
		value === null ||
		value === undefined ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return String(value);
	}

	return null;
}

/** The selections `after` adds to `before`, `null` when it changed anything else (a join, a filter). */
function selectionsAdded(
	before: AnyQB,
	after: AnyQB,
): MemoizedSelections | null {
	const beforeNode: Record<string, unknown> = { ...before.toOperationNode() };
	const afterNode: SelectQueryNode = after.toOperationNode();

	const afterFields: Record<string, unknown> = { ...afterNode };
	const keys = new Set([
		...Object.keys(beforeNode),
		...Object.keys(afterFields),
	]);
	for (const key of keys) {
		if (key !== "selections" && beforeNode[key] !== afterFields[key]) {
			return null;
		}
	}

	const added = afterNode.selections?.slice(
		(beforeNode.selections as unknown[] | undefined)?.length ?? 0,
	);
	if (!added || added.length === 0) return null;

	return added.map(({ selection }) => ({ toOperationNode: () => selection }));
}

function selectMemoized(qb: AnyQB, selections: MemoizedSelections) {
	// any operation node source is accepted as a selection, Kysely's types only list its builders
	return qb.select(
		selections as unknown as ReadonlyArray<SelectExpression<any, any>>,
	);
}

function sameQuery(a: AnyQB, b: AnyQB) {
	const left = a.compile();
	const right = b.compile();

	return (
		left.sql === right.sql &&
		left.parameters.length === right.parameters.length &&
		left.parameters.every((parameter, i) =>
			sameParameter(parameter, right.parameters[i]),
		)
	);
}

/** Runs `build` with the clock a day ahead, so a step reading the clock builds different SQL. */
function withShiftedClock<T>(build: () => T): T {
	const RealDate = Date;
	const now = () => RealDate.now() + CLOCK_SHIFT_MS;
	class ShiftedDate extends RealDate {
		constructor(...args: unknown[]) {
			super(...((args.length === 0 ? [now()] : args) as [number]));
		}

		static now() {
			return now();
		}

		// dates made before the shift are still dates
		static [Symbol.hasInstance](value: unknown) {
			return value instanceof RealDate;
		}
	}

	// building is synchronous, so nothing else runs while the clock is shifted
	globalThis.Date = ShiftedDate as unknown as DateConstructor;
	try {
		return build();
	} finally {
		globalThis.Date = RealDate;
	}
}

function sameParameter(a: unknown, b: unknown) {
	if (a instanceof Date && b instanceof Date) {
		return a.getTime() === b.getTime();
	}
	if (typeof a === "object" && a !== null) {
		return JSON.stringify(a) === JSON.stringify(b);
	}

	return Object.is(a, b);
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
	const encoded = values.map((value) =>
		value instanceof Date ? { date: value.getTime() } : value,
	);
	return Buffer.from(JSON.stringify(encoded)).toString("base64url");
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
		if (!Array.isArray(values) || values.length !== keyCount) return null;

		const decoded = values.map(decodeCursorValue);
		if (decoded.every((value) => value !== null)) return decoded;
	} catch {
		// tampered cursors serve the first page
	}

	return null;
}

function decodeCursorValue(value: unknown): CursorValue | null {
	if (typeof value === "string") return value;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (
		typeof value === "object" &&
		value !== null &&
		"date" in value &&
		typeof value.date === "number" &&
		Number.isFinite(value.date)
	) {
		return new Date(value.date);
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
