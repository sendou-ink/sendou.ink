import type {
	OrderByDirection,
	OrderByExpression,
	SelectQueryBuilder,
	StringReference,
} from "kysely";
import { db } from "./sql";
import type { DB } from "./tables";

type NoSelections = Record<never, never>;

export type SortKey<TB extends keyof DB> = readonly [
	OrderByExpression<DB, TB, NoSelections>,
	OrderByDirection,
];

interface FindPageArgs<TB extends keyof DB, Row extends { id: number }> {
	/** The rows to page through: `selectFrom`, joins and filters only, no selections or sort. */
	query: SelectQueryBuilder<DB, TB, NoSelections>;
	/** The rows' id column, appended as the last sort key so equal keys never swap between pages. */
	id: StringReference<DB, TB>;
	orderBy: ReadonlyArray<SortKey<TB>>;
	/** 1-based. */
	page: number;
	pageSize: number;
	/** Serves the page holding this id instead of `page`, when it is among the rows. */
	containingId?: number | null;
	/** Fetches the full rows of one page's ids, in any order. */
	rowsByIds: (ids: number[]) => Promise<Row[]>;
	/**
	 * Counts the rows in a query of their own instead of a window over the page's ids. Faster when an
	 * index serves `orderBy`: the ids then stop at the page's end and the count is an index scan.
	 */
	separateCount?: boolean;
}

/**
 * Numbered page of a query's rows, resolved in two phases: `query` is sorted and sliced into one
 * page's ids (with the total as a window count), then `rowsByIds` fetches only those rows. The
 * expensive selections (JSON subqueries, aggregates) so run for one page instead of every row.
 */
export async function findPage<
	TB extends keyof DB,
	Row extends { id: number },
>({
	query,
	id,
	orderBy,
	page,
	pageSize,
	containingId,
	rowsByIds,
	separateCount = false,
}: FindPageArgs<TB, Row>) {
	const keys: ReadonlyArray<SortKey<TB>> = [...orderBy, [id, "asc"]];

	const currentPage =
		(typeof containingId === "number"
			? await pageContaining({ query, id, keys, pageSize, containingId })
			: null) ?? page;

	let idsQuery = query.select((eb) => [
		eb.ref(id).$castTo<number>().as("id"),
		(separateCount ? eb.lit(null) : eb.fn.countAll<number>().over()).as(
			"totalCount",
		),
	]);
	for (const [expression, direction] of keys) {
		idsQuery = idsQuery.orderBy(expression, direction);
	}
	const idRows = await idsQuery
		.limit(pageSize)
		.offset((currentPage - 1) * pageSize)
		.execute();

	// the total rides along the page's ids, only a page past a non-empty result's end needs its own count
	const totalCount = separateCount
		? await countRows(query)
		: (idRows[0]?.totalCount ??
			(currentPage === 1 ? 0 : await countRows(query)));

	const ids = idRows.map((row) => row.id);
	const rowsById = new Map(
		(ids.length > 0 ? await rowsByIds(ids) : []).map((row) => [row.id, row]),
	);

	return {
		items: ids.flatMap((rowId) => rowsById.get(rowId) ?? []),
		currentPage,
		totalCount,
	};
}

async function pageContaining<TB extends keyof DB>({
	query,
	id,
	keys,
	pageSize,
	containingId,
}: {
	query: SelectQueryBuilder<DB, TB, NoSelections>;
	id: StringReference<DB, TB>;
	keys: ReadonlyArray<SortKey<TB>>;
	pageSize: number;
	containingId: number;
}) {
	const ranked = query.select((eb) => [
		eb.ref(id).$castTo<number>().as("id"),
		eb.fn
			.agg<number>("row_number")
			.over((ob) => {
				let ordered = ob;
				for (const [expression, direction] of keys) {
					ordered = ordered.orderBy(expression, direction);
				}
				return ordered;
			})
			.as("position"),
	]);

	const row = await db
		.selectFrom(ranked.as("ranked"))
		.select("ranked.position")
		.where("ranked.id", "=", containingId)
		.executeTakeFirst();

	return row ? Math.floor((row.position - 1) / pageSize) + 1 : null;
}

async function countRows<TB extends keyof DB>(
	query: SelectQueryBuilder<DB, TB, NoSelections>,
) {
	const { count } = await db
		.selectFrom(query.select((eb) => eb.lit(1).as("one")).as("counted"))
		.select((eb) => eb.fn.countAll<number>().as("count"))
		.executeTakeFirstOrThrow();

	return count;
}
