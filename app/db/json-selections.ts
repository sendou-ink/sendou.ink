import {
	AggregateFunctionNode,
	AliasNode,
	ColumnNode,
	FunctionNode,
	IdentifierNode,
	type OperationNode,
	RawNode,
	ReferenceNode,
	type RootOperationNode,
	SelectQueryNode,
} from "kysely";
import { JSON_COLUMNS } from "./json-columns";

/** SQL shapes {@link jsonValuedNode} recognizes: the subqueries the json helpers emit and direct `json*(` function calls (e.g. `jsonBuildObject`, `json_set`). */
const JSON_EXPRESSION_PREFIX =
	/^\s*(\(select\s+(coalesce\()?)?json(_\w+)?\s*\(/i;

const NO_NAMES: ReadonlySet<string> = new Set();

/** Output names of the query's computed result columns whose value is a JSON document, e.g. the subquery a `jsonArrayFrom` selection compiles to. */
export function computedJsonColumns(
	query: RootOperationNode,
): ReadonlySet<string> {
	// `returning` selections keep the origin metadata of the column they write to
	return SelectQueryNode.is(query) ? outputNames(query) : NO_NAMES;
}

/** Output name a selection comes back under, or `undefined` for selections that have none (`selectAll()`). */
export function selectionOutputName(
	selection: OperationNode,
): string | undefined {
	if (ReferenceNode.is(selection) && ColumnNode.is(selection.column)) {
		return selection.column.column.name;
	}
	if (ColumnNode.is(selection)) {
		return selection.column.name;
	}
	if (AliasNode.is(selection) && IdentifierNode.is(selection.alias)) {
		return selection.alias.name;
	}

	return undefined;
}

/** Whether a select list entry resolves to a JSON document. */
export function jsonValuedSelection(
	selection: OperationNode,
	sources?: SourceOutputNames,
): boolean {
	if (AliasNode.is(selection)) return jsonValuedNode(selection.node, sources);

	return jsonValuedReference(selection, sources);
}

/** Whether an expression resolves to a JSON document. */
export function jsonValuedNode(
	node: OperationNode,
	sources?: SourceOutputNames,
): boolean {
	if (RawNode.is(node)) {
		return JSON_EXPRESSION_PREFIX.test(node.sqlFragments[0] ?? "");
	}
	if (AggregateFunctionNode.is(node) || FunctionNode.is(node)) {
		return node.func.startsWith("json");
	}
	if (SelectQueryNode.is(node)) {
		const selections = node.selections ?? [];
		return (
			selections.length === 1 &&
			jsonValuedSelection(selections[0].selection, sourceOutputNames(node))
		);
	}

	return jsonValuedReference(node, sources);
}

/** JSON-valued output names of the derived tables and CTEs a query selects from, by the name they are visible under. */
type SourceOutputNames = ReadonlyMap<string, ReadonlySet<string>>;

function outputNames(select: SelectQueryNode): ReadonlySet<string> {
	const sources = sourceOutputNames(select);
	const names = new Set<string>();

	for (const { selection } of select.selections ?? []) {
		const name = selectionOutputName(selection);
		if (name && jsonValuedSelection(selection, sources)) {
			names.add(name);
		}
	}

	// a compound select is named after its first branch, but any branch can contribute the JSON
	for (const { expression } of select.setOperations ?? []) {
		if (!SelectQueryNode.is(expression)) continue;

		for (const name of outputNames(expression)) {
			names.add(name);
		}
	}

	return names;
}

function sourceOutputNames(select: SelectQueryNode): SourceOutputNames {
	const sources = new Map<string, ReadonlySet<string>>();

	for (const cte of select.with?.expressions ?? []) {
		if (!SelectQueryNode.is(cte.expression)) continue;

		sources.set(
			cte.name.table.table.identifier.name,
			outputNames(cte.expression),
		);
	}

	const tables = [
		...(select.from?.froms ?? []),
		...(select.joins ?? []).map((join) => join.table),
	];
	for (const table of tables) {
		if (
			!AliasNode.is(table) ||
			!SelectQueryNode.is(table.node) ||
			!IdentifierNode.is(table.alias)
		) {
			continue;
		}

		sources.set(table.alias.name, outputNames(table.node));
	}

	return sources;
}

function jsonValuedReference(node: OperationNode, sources?: SourceOutputNames) {
	if (
		!ReferenceNode.is(node) ||
		!ColumnNode.is(node.column) ||
		node.table === undefined
	) {
		return false;
	}

	const table = node.table.table.identifier.name;
	const column = node.column.column.name;

	return (
		JSON_COLUMNS.has(`${table}.${column}`) ||
		Boolean(sources?.get(table)?.has(column))
	);
}
