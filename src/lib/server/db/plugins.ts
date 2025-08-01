import {
	OperationNodeTransformer,
	ValueNode,
	type KyselyPlugin,
	type PluginTransformQueryArgs,
	type PluginTransformResultArgs,
	type QueryResult,
	type RootOperationNode,
	type UnknownRow
} from 'kysely';

export class SqliteDatePlugin implements KyselyPlugin {
	readonly #transformer = new SqliteDateTransformer();

	transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
		return this.#transformer.transformNode(args.node);
	}

	transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
		// xxx: handle also nested (json, arrays)

		return Promise.resolve({
			...args.result,
			rows: args.result.rows.map((row) => {
				const transformedRow: Record<string, any> = {};
				for (const [key, value] of Object.entries(row)) {
					transformedRow[key] =
						typeof value === 'number' && value > 1_000_000_000 && value < 5_000_000_000
							? new Date(value * 1000)
							: value;
				}
				return transformedRow;
			})
		});
	}
}

class SqliteDateTransformer extends OperationNodeTransformer {
	transformValue(node: ValueNode): ValueNode {
		return {
			...super.transformValue(node),
			value: node.value instanceof Date ? Math.floor(node.value.getTime() / 1000) : node.value
		};
	}
}
