import {
	OperationNodeTransformer,
	PrimitiveValueListNode,
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
	protected transformPrimitiveValueList(node: PrimitiveValueListNode): PrimitiveValueListNode {
		return {
			...node,
			values: node.values.map((value) => maybeDateToNumber(value))
		};
	}

	transformValue(node: ValueNode): ValueNode {
		return {
			...super.transformValue(node),
			value: maybeDateToNumber(node.value)
		};
	}
}

function maybeDateToNumber(value: unknown): unknown {
	if (value instanceof Date) {
		return Math.floor(value.getTime() / 1000);
	}
	return value;
}

// credits https://github.com/kysely-org/kysely/issues/123#issuecomment-1194184342
export class SqliteBooleanPlugin implements KyselyPlugin {
	readonly #transformer = new SqliteBooleanTransformer();

	transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
		return this.#transformer.transformNode(args.node);
	}

	transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
		return Promise.resolve(args.result);
	}
}

function maybeBooleanToNumber(value: unknown): unknown {
	if (typeof value === 'boolean') {
		return value ? 1 : 0;
	}
	return value;
}

class SqliteBooleanTransformer extends OperationNodeTransformer {
	transformValue(node: ValueNode): ValueNode {
		return {
			...super.transformValue(node),
			value: maybeBooleanToNumber(node.value)
		};
	}

	protected transformPrimitiveValueList(node: PrimitiveValueListNode): PrimitiveValueListNode {
		return {
			...node,
			values: node.values.map((value) => maybeBooleanToNumber(value))
		};
	}
}
