import type { ShouldRevalidateFunctionArgs } from "react-router";
import { isRevalidation } from "~/utils/remix";
import type { RevalidateScope } from "./chat-types";

const BROADCAST_REVALIDATE_MAX_JITTER_MS = 1_500;
// past this a revalidation still counted as in flight is taken to be orphaned, not slow
const PENDING_REVALIDATION_STALE_MS = 30 * 1000;

let activeScope: RevalidateScope | null = null;
let pendingRevalidations = 0;
let oldestPendingStartedAt: number | null = null;
let revalidationGeneration = 0;
let scheduledBroadcast: { scope: RevalidateScope | null } | null = null;

/**
 * Runs a websocket broadcast triggered revalidation, remembering the broadcast's scope
 * while it is in flight so `shouldRevalidate` implementations can skip loaders whose
 * data the broadcast can not have changed.
 */
export function revalidateWithScope(
	revalidate: () => Promise<void>,
	scope: RevalidateScope | undefined,
) {
	if (!scope) {
		activeScope = null;
	} else if (pendingRevalidations === 0) {
		// never narrow the scope of an unscoped revalidation already in flight
		activeScope = scope;
	}

	const generation = revalidationGeneration;
	if (pendingRevalidations === 0) {
		oldestPendingStartedAt = Date.now();
	}
	pendingRevalidations++;
	void revalidate().finally(() => {
		if (generation !== revalidationGeneration) return;

		pendingRevalidations--;
		if (pendingRevalidations === 0) {
			activeScope = null;
			oldestPendingStartedAt = null;
		}
	});
}

/**
 * Runs a websocket broadcast triggered revalidation after a random delay so the clients
 * subscribed to a topic do not all refetch in the same instant the broadcast fans out
 * (thundering herd — a broadcast to e.g. the SendouQ looking room or a live tournament's
 * room reaches every client on that page at once). A broadcast arriving while one is
 * already scheduled is absorbed into it, widening its scope as needed: the eventual
 * single fetch returns data fresh enough to cover both.
 */
export function scheduleBroadcastRevalidation(
	revalidate: () => Promise<void>,
	scope: RevalidateScope | undefined,
) {
	if (scheduledBroadcast) {
		if (scheduledBroadcast.scope !== (scope ?? null)) {
			scheduledBroadcast.scope = null;
		}
		return;
	}

	const pending: { scope: RevalidateScope | null } = { scope: scope ?? null };
	scheduledBroadcast = pending;
	setTimeout(() => {
		scheduledBroadcast = null;
		forgetStalePendingRevalidations();
		revalidateWithScope(revalidate, pending.scope ?? undefined);
	}, Math.random() * BROADCAST_REVALIDATE_MAX_JITTER_MS);
}

/**
 * Whether the pending revalidation is a websocket broadcast scoped to match results,
 * meaning only match data (reported scores, pick/ban events) changed. Loaders whose data
 * does not derive from match data can return `false` from `shouldRevalidate` for these —
 * during a live tournament this is the most frequent broadcast: one per reported game.
 */
export function isMatchResultsScopedRevalidation(
	args: ShouldRevalidateFunctionArgs,
) {
	return isRevalidation(args) && activeScope === "MATCH_RESULTS";
}

/**
 * Drops the bookkeeping of revalidations counted as in flight for longer than one can
 * plausibly take. A `revalidate()` interrupted by a navigation never settles, which would
 * otherwise leave `activeScope` stuck for the life of the tab and make every later
 * broadcast skip the loaders it narrows away. Only the stuck case is forgotten, so a
 * revalidation genuinely in flight keeps its scope from being narrowed under it.
 */
function forgetStalePendingRevalidations() {
	const isStale =
		oldestPendingStartedAt !== null &&
		Date.now() - oldestPendingStartedAt >= PENDING_REVALIDATION_STALE_MS;
	if (!isStale) return;

	pendingRevalidations = 0;
	oldestPendingStartedAt = null;
	activeScope = null;
	revalidationGeneration++;
}
