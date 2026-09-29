import type {
	AnyColumnWithTable,
	CompiledQuery,
	OrderByDirection,
	SelectQueryBuilder,
	Simplify,
} from "kysely";
import type { ColumnFilter, TableName } from "./schema-types";
import { db } from "./sql";
import type { DB } from "./tables";

type AnyQB = SelectQueryBuilder<any, any, any>;
type NoFields = Record<never, never>;
type RootQB<R extends TableName> = SelectQueryBuilder<DB, R, NoFields>;
type Override<O, A> = Simplify<Omit<O, keyof A> & A>;
type SortKey = readonly [string, OrderByDirection];

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
		? AnyColumnWithTable<D, TB>
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
	...keys: Array<readonly [AnyColumnWithTable<DB, R>, OrderByDirection]>
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
	execute(): Promise<O[]>;
	executeTakeFirst(): Promise<O | undefined>;
	compile(): CompiledQuery;
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
 * and filters, selections, sort, limit, mappers), so call order only matters for sort keys.
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

	const build = (limit = state.limit) => {
		let qb: AnyQB = (db as unknown as SelectFromAny).selectFrom(
			definition.root,
		);

		const lifted = new Set(state.steps.flatMap((step) => step.lifts ?? []));
		for (const [name, guard] of Object.entries(definition.guards ?? {})) {
			if (!lifted.has(name)) qb = guard(qb);
		}

		for (const filter of state.filters) {
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
			if (step.apply) qb = applyWithoutOrderBy(qb, step.apply);
		}

		qb = definition.select(qb);

		const stepSortKeys = state.steps.flatMap((step) => step.sortKeys ?? []);
		const sortKeys =
			stepSortKeys.length > 0 ? stepSortKeys : (definition.defaultSort ?? []);
		for (const [column, direction] of sortKeys) {
			qb = qb.orderBy(column, direction);
		}

		if (typeof limit === "number") qb = qb.limit(limit);

		return qb;
	};

	const mapRow = (row: Record<string, unknown>) => {
		let result = definition.map ? { ...row, ...definition.map(row) } : row;
		for (const step of state.steps) {
			if (step.map) result = { ...result, ...step.map(result) };
		}
		return result;
	};

	const chain: Record<string, unknown> = {
		where: (filter: Record<string, unknown>) =>
			next({ filters: [...state.filters, filter] }),
		with: addStep,
		limit: (count: number) => next({ limit: count }),
		compile: () => build().compile(),
		execute: async () => (await build().execute()).map(mapRow),
		executeTakeFirst: async () => {
			const row = await build(1).executeTakeFirst();
			return row ? mapRow(row) : undefined;
		},
	};

	for (const [name, factory] of Object.entries(vocabulary)) {
		chain[name] = (...args: unknown[]) => addStep(factory(...args));
	}

	return chain;
}

interface SelectFromAny {
	selectFrom(table: string): AnyQB;
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
