import {
	type InsertQueryNode,
	type KyselyPlugin,
	type PluginTransformQueryArgs,
	type PluginTransformResultArgs,
	type QueryResult,
	RawNode,
	type RootOperationNode,
	SelectionNode,
	SelectQueryNode,
	type UnknownRow,
	ValuesNode,
	WhereNode,
} from "kysely";

/**
 * Makes inserting an empty array of values a no-op instead of a syntax error.
 * Kysely compiles `.values([])` into invalid SQL, so without this plugin every
 * dynamic multi-row insert would need a length check before it. The empty
 * insert is rewritten into `INSERT INTO "T" SELECT * FROM "T" WHERE 0` which
 * inserts zero rows and returns zero rows for any `returning` clause.
 */
export class EmptyValuesNoopPlugin implements KyselyPlugin {
	transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
		if (args.node.kind !== "InsertQueryNode" || !isEmptyInsert(args.node)) {
			return args.node;
		}

		const { columns: _columns, ...node } = args.node;

		return Object.freeze({
			...node,
			values: selectNothingFrom(args.node),
		});
	}

	async transformResult(
		args: PluginTransformResultArgs,
	): Promise<QueryResult<UnknownRow>> {
		return args.result;
	}
}

function isEmptyInsert(node: InsertQueryNode) {
	return (
		node.values !== undefined &&
		ValuesNode.is(node.values) &&
		node.values.values.length === 0
	);
}

function selectNothingFrom(node: InsertQueryNode): SelectQueryNode {
	return Object.freeze({
		...SelectQueryNode.createFrom([node.into!]),
		selections: Object.freeze([SelectionNode.createSelectAll()]),
		where: WhereNode.create(RawNode.createWithSql("0")),
	});
}
