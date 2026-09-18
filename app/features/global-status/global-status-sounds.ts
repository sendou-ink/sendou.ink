import * as React from "react";
import { playSound } from "~/features/chat/chat-utils";
import type { GlobalStatus, GlobalStatusState } from "./global-status-types";

const SOUND_BY_STATE: Partial<Record<GlobalStatusState, string>> = {
	SQ_READY_CHECK: "sq_ready-check",
	SQ_MATCH: "sq_match",
	TO_MATCH: "tournament_match",
};

/**
 * Plays the alert sound of a status the user has just moved into (a ready
 * check starting, a match being ready to play) as well as of a like landing
 * while queued. Driving them off the header status is what makes them heard
 * anywhere on the site rather than only on the page the moment belongs to.
 *
 * The first status seen never plays: a sound announces a moment arriving, not
 * one already underway when the page was opened.
 */
export function useGlobalStatusSounds(status: GlobalStatus | null) {
	const previousRef = React.useRef<GlobalStatus | null | undefined>(undefined);

	React.useEffect(() => {
		const previous = previousRef.current;
		previousRef.current = status;

		if (previous === undefined || !status) return;

		const sound = soundForTransition(previous, status);
		if (sound) playSound(sound);
	}, [status]);
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
