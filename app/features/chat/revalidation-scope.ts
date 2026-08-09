import type { ShouldRevalidateFunctionArgs } from "react-router";
import { isRevalidation } from "~/utils/remix";
import type { RevalidateScope } from "./chat-types";

const BROADCAST_REVALIDATE_MAX_JITTER_MS = 1_500;

let activeScope: RevalidateScope | null = null;
let pendingRevalidations = 0;
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

	pendingRevalidations++;
	void revalidate().finally(() => {
		pendingRevalidations--;
		if (pendingRevalidations === 0) {
			activeScope = null;
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
