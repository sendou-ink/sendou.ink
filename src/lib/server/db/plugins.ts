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

// credits https://github.com/kysely-org/kysely/issues/123#issuecomment-1194184342
// xxx: not working yet, why?
export class SqliteBooleanPlugin implements KyselyPlugin {
	readonly #transformer = new SqliteBooleanTransformer();

	transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
		return this.#transformer.transformNode(args.node);
	}

	transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
		return Promise.resolve(args.result);
	}
}

class SqliteBooleanTransformer extends OperationNodeTransformer {
	transformValue(node: ValueNode): ValueNode {
		console.log({ node });
		return {
			...super.transformValue(node),
			value: typeof node.value === 'boolean' ? (node.value ? 1 : 0) : node.value
		};
	}
}
