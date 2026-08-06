import type { ShouldRevalidateFunctionArgs } from "react-router";
import { isRevalidation } from "~/utils/remix";
import type { RevalidateScope } from "./chat-types";

let activeScope: RevalidateScope | null = null;
let pendingRevalidations = 0;

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
