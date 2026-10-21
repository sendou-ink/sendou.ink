import {
	AUTO_CLOSE_MINUTES,
	CHECK_IN_LEAD_MINUTES,
	type LobbyParticipantStatus,
} from "../lobbies-constants";

/**
 * - `UPCOMING`: before check-in opens, people sign up
 * - `CHECK_IN`: check-in is open, the lobby starts at its start time
 * - `PENDING`: started but no set is being played (fewer than 8 in the room)
 * - `ACTIVE`: a set is being played
 * - `ENDED`: ended by the host or closed for inactivity
 */
export type LobbyStatus =
	| "UPCOMING"
	| "CHECK_IN"
	| "PENDING"
	| "ACTIVE"
	| "ENDED";

const SECONDS_PER_MINUTE = 60;

/** Current status of the lobby, see {@link LobbyStatus}. */
export function status({
	lobby,
	isPlaying,
	now,
}: {
	lobby: { startsAt: number; endedAt: number | null };
	/** The room's latest set is unfinished */
	isPlaying: boolean;
	now: number;
}): LobbyStatus {
	if (lobby.endedAt !== null) return "ENDED";
	if (now < checkInOpensAt(lobby.startsAt)) return "UPCOMING";
	if (now < lobby.startsAt) return "CHECK_IN";

	return isPlaying ? "ACTIVE" : "PENDING";
}

/** When check-in opens: some minutes before the start, or right away for a lobby starting about now. */
export function checkInOpensAt(startsAt: number) {
	return startsAt - CHECK_IN_LEAD_MINUTES * SECONDS_PER_MINUTE;
}

/** Whether a lobby has gone long enough without anything happening to be closed. */
export function isAutoCloseDue({
	status: lobbyStatus,
	lastActivityAt,
	pendingSince,
	now,
}: {
	status: LobbyStatus;
	/** Latest map reported or set started */
	lastActivityAt: number | null;
	pendingSince: number | null;
	now: number;
}) {
	const limit = AUTO_CLOSE_MINUTES * SECONDS_PER_MINUTE;

	if (lobbyStatus === "ACTIVE") {
		return lastActivityAt !== null && now - lastActivityAt >= limit;
	}
	if (lobbyStatus === "PENDING") {
		return pendingSince !== null && now - pendingSince >= limit;
	}

	return false;
}

/** Who becomes the host when the current one leaves: the participant who signed up the earliest. */
export function nextHost<T extends { userId: number; joinedAt: number }>(
	participants: T[],
): number | null {
	const [first] = participants.toSorted(
		(a, b) => a.joinedAt - b.joinedAt || a.userId - b.userId,
	);

	return first?.userId ?? null;
}

export interface ViewerActions {
	SIGN_UP: boolean;
	CHECK_IN: boolean;
	/** Leave the lobby right away, forfeiting a set being played */
	LEAVE: boolean;
	/** Toggle leaving once the set being played is confirmed */
	DROP_AFTER_SET: boolean;
}

/** What the viewer may do in the lobby right now. */
export function viewerActions({
	status: lobbyStatus,
	viewer,
	isPlayingUnfinishedSet,
	hasFriendCode,
	activeCount,
	roomSize,
	now,
	startsAt,
}: {
	status: LobbyStatus;
	viewer: { status: LobbyParticipantStatus } | null;
	isPlayingUnfinishedSet: boolean;
	hasFriendCode: boolean;
	/** Participants present (checked in or in the room) */
	activeCount: number;
	roomSize: number;
	now: number;
	startsAt: number;
}): ViewerActions {
	if (lobbyStatus === "ENDED") {
		return {
			SIGN_UP: false,
			CHECK_IN: false,
			LEAVE: false,
			DROP_AFTER_SET: false,
		};
	}

	if (!viewer) {
		return {
			SIGN_UP: hasFriendCode,
			CHECK_IN: false,
			LEAVE: false,
			DROP_AFTER_SET: false,
		};
	}

	const hasStarted = now >= startsAt;
	const canCheckIn =
		lobbyStatus !== "UPCOMING" &&
		(hasStarted
			? viewer.status !== "CHECKED_IN" &&
				viewer.status !== "IN_ROOM" &&
				activeCount < roomSize
			: viewer.status === "REGISTERED");

	return {
		SIGN_UP: false,
		CHECK_IN: canCheckIn,
		LEAVE: true,
		DROP_AFTER_SET: isPlayingUnfinishedSet,
	};
}
