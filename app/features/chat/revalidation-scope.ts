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

/** Runs a broadcast triggered revalidation, remembering its scope while in flight so `shouldRevalidate` can skip loaders the broadcast cannot have changed. */
export function revalidateWithScope(
	revalidate: () => Promise<void>,
	scope: RevalidateScope | undefined,
) {
	forgetStalePendingRevalidations();

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
 * Runs a broadcast triggered revalidation after a random delay so a topic's clients do not all
 * refetch in the same instant (thundering herd on e.g. the SendouQ looking channel). A broadcast
 * arriving while one is scheduled is absorbed into it, widening its scope as needed.
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
		revalidateWithScope(revalidate, pending.scope ?? undefined);
	}, Math.random() * BROADCAST_REVALIDATE_MAX_JITTER_MS);
}

/**
 * Whether the pending revalidation is scoped to match results (reported scores, pick/ban events).
 * Loaders not derived from match data can return `false` from `shouldRevalidate` for these — the
 * most frequent broadcast during a live tournament, one per reported game.
 */
export function isMatchResultsScopedRevalidation(
	args: ShouldRevalidateFunctionArgs,
) {
	return isRevalidation(args) && activeScope === "MATCH_RESULTS";
}

/**
 * Forgets revalidations counted as in flight for implausibly long: a `revalidate()` interrupted
 * by a navigation never settles and would leave `activeScope` stuck for the life of the tab.
 * Only the stuck case is forgotten, so a genuine in-flight one keeps its scope.
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
