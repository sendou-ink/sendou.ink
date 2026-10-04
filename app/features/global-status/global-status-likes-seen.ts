import * as React from "react";
import * as v from "valibot";
import { usePersistedState } from "~/modules/persisted-state/hooks";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import type { GlobalStatus } from "./global-status-types";

const seenSqLikesPersisted = PersistedState.define({
	key: "seen-sq-likes",
	storage: "local",
	schema: v.nullable(v.object({ groupId: v.number(), seenCount: v.number() })),
	default: null,
});

/**
 * Whether the queued status carries likes the user has not seen on this device
 * yet, highlighting the header's count badge. Likes count as seen once the
 * /q/looking page — where they are shown — has been viewed with them present.
 */
export function useHasUnseenSqLikes(status: GlobalStatus | null): boolean {
	const [seen] = usePersistedState(seenSqLikesPersisted);

	if (
		status?.state !== "SQ_QUEUED" ||
		!status.count ||
		typeof status.groupId !== "number"
	) {
		return false;
	}
	if (!seen || seen.groupId !== status.groupId) return true;

	return status.count > seen.seenCount;
}

/**
 * Records the group's likes as seen while the user is on the page showing
 * them, clearing the header badge highlight. The header's count is seen too as
 * it can run ahead of the likes shown, e.g. a liker left the looking pool.
 */
export function useMarkSqLikesSeen({
	groupId,
	receivedLikesCount,
	status,
}: {
	groupId: number | undefined;
	receivedLikesCount: number;
	status: GlobalStatus | null;
}) {
	const headerCount =
		status?.state === "SQ_QUEUED" && status.groupId === groupId
			? (status.count ?? 0)
			: 0;
	const seenCount = Math.max(receivedLikesCount, headerCount);

	React.useEffect(() => {
		if (typeof groupId !== "number") return;

		PersistedState.write(seenSqLikesPersisted, { groupId, seenCount });
	}, [groupId, seenCount]);
}
