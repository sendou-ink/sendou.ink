import type {
	KyselyPlugin,
	PluginTransformQueryArgs,
	PluginTransformResultArgs,
	QueryResult,
	RootOperationNode,
	UnknownRow,
} from "kysely";

let dirty = false;

/**
 * Records whether anything has been written to the database, so that a caller can
 * react to writes it did not make itself: the vitest teardown wipes only when a
 * test wrote something, and an e2e worker flushes the app server's caches only
 * when its factories wrote something.
 */
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
