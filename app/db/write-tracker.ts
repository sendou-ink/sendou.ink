import type {
	KyselyPlugin,
	PluginTransformQueryArgs,
	PluginTransformResultArgs,
	QueryResult,
	RootOperationNode,
	UnknownRow,
} from "kysely";

let dirty = false;

/** Tracks writes so vitest teardown wipes only after a writing test and e2e workers flush caches only after factory writes. */
export class WriteTrackerPlugin implements KyselyPlugin {
	transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
		if (args.node.kind !== "SelectQueryNode") {
			dirty = true;
		}

		return args.node;
	}

	async transformResult(
		args: PluginTransformResultArgs,
	): Promise<QueryResult<UnknownRow>> {
		return args.result;
	}
}

/** Whether the database has been written to since the last {@link markDatabaseClean}. */
export function isDatabaseDirty() {
	return dirty;
}

export function markDatabaseClean() {
	dirty = false;
}
