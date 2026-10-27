import * as React from "react";
import * as v from "valibot";
import * as Attention from "~/features/chat/core/Attention";
import * as Sounds from "~/features/chat/core/Sounds";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import type { GlobalStatus, GlobalStatusState } from "./global-status-types";

const SOUND_BY_STATE: Partial<Record<GlobalStatusState, string>> = {
	SQ_READY_CHECK: "sq_ready-check",
	SQ_MATCH: "sq_match",
	TO_MATCH: "tournament_match",
	LOBBY_READY_CHECK: "sq_ready-check",
	LOBBY_MATCH: "sq_match",
};

const lastSeenStatusPersisted = PersistedState.define({
	key: "global-status-last-seen",
	storage: "local",
	schema: v.nullable(v.string()),
	default: null,
});

/**
 * Plays the alert sound of a status the user has just moved into (a ready
 * check starting, a match being ready to play) as well as of a like landing
 * while queued. Driving them off the header status is what makes them heard
 * anywhere on the site rather than only on the page the moment belongs to.
 *
 * The first status seen never plays: a sound announces a moment arriving, not
 * one already underway when the page was opened. Only the tab the user was last
 * active in plays (and marks a status seen): a tab never brought to the front
 * would hold its sound back until it is. A status already seen doesn't play
 * either, so a backgrounded tab catching up once switched to stays silent.
 */
export function useGlobalStatusSounds(status: GlobalStatus | null) {
	const previousRef = React.useRef<GlobalStatus | null | undefined>(undefined);

	React.useEffect(() => {
		const previous = previousRef.current;
		previousRef.current = status;

		if (!Attention.tracker.isLastActiveTab()) return;

		const seenByAnotherTab = markSeenAcrossTabs(status);

		if (previous === undefined || !status || seenByAnotherTab) return;

		const sound = soundForTransition(previous, status);
		if (sound) Sounds.play(sound);
	}, [status]);
}

/** Records the status as the latest seen by any tab, returning whether it already was. */
function markSeenAcrossTabs(status: GlobalStatus | null) {
	const key = status ? statusKey(status) : null;
	if (PersistedState.read(lastSeenStatusPersisted) === key) return true;

	PersistedState.write(lastSeenStatusPersisted, key);
	return false;
}

function statusKey(status: GlobalStatus) {
	if (status.state === "SQ_QUEUED") {
		return `${status.state}:${status.groupId}:${status.count ?? 0}`;
	}

	return `${status.state}:${status.url}`;
}

function soundForTransition(
	previous: GlobalStatus | null,
	next: GlobalStatus,
): string | null {
	if (next.state !== previous?.state) {
		return SOUND_BY_STATE[next.state] ?? null;
	}

	const likeReceived =
		next.state === "SQ_QUEUED" &&
		next.groupId === previous.groupId &&
		(next.count ?? 0) > (previous.count ?? 0);

	return likeReceived ? "sq_like" : null;
}
