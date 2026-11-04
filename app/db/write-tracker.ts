import type {
	KyselyPlugin,
	PluginTransformQueryArgs,
	PluginTransformResultArgs,
	QueryResult,
	RootOperationNode,
	UnknownRow,
} from "kysely";

let dirty = false;
let queried = false;

/** Tracks writes so vitest teardown wipes only after a writing test and e2e workers flush caches only after factory writes, and reads so vitest refreshes in-process caches only after a test that queried. */
export class WriteTrackerPlugin implements KyselyPlugin {
	transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
		queried = true;
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

/**
 * Whether the database has been written to since the last {@link markDatabaseClean}.
 * @internal
 */
export function isDatabaseDirty() {
	return dirty;
}

/**
 *
 * @internal
 */
export function markDatabaseClean() {
	dirty = false;
}

/**
 * Whether any query, reads included, has run since the last {@link markDatabaseUnqueried}.
 * @internal
 */
export function isDatabaseQueried() {
	return queried;
}

/** @internal */
export function markDatabaseUnqueried() {
	queried = false;
}
