/**
 * Lobby status over time (upcoming, check-in, pending, active, ended), when check-in opens, when an idle lobby closes,
 * who takes over as host and what the viewer may do on the lobby page.
 */
import {
	AUTO_CLOSE_MINUTES,
	CHECK_IN_LEAD_MINUTES,
	type LobbyApplicationState,
	type LobbyParticipantStatus,
	PLAYERS_PER_SET,
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

/**
 * Current status of the lobby, see {@link LobbyStatus}. Callers go through {@link statusAndCheckIn}.
 * @internal
 */
export function status({
	lobby,
	isPlaying,
	isCheckInOpen: checkInOpen,
	now,
}: {
	lobby: { startsAt: number; endedAt: number | null };
	/** The room's latest set is unfinished */
	isPlaying: boolean;
	/** See {@link isCheckInOpen} */
	isCheckInOpen: boolean;
	now: number;
}): LobbyStatus {
	if (lobby.endedAt !== null) return "ENDED";
	if (now < lobby.startsAt) return checkInOpen ? "CHECK_IN" : "UPCOMING";

	return isPlaying ? "ACTIVE" : "PENDING";
}

/**
 * Whether check-in is open: once enough for a set have signed up and the start is at most some minutes away
 * (or past). Stays open after it has opened, even if people leave.
 */
export function isCheckInOpen({
	lobby,
	participants,
	now,
}: {
	lobby: { startsAt: number; checkInOpenedAt: number | null };
	participants: Array<{ status: LobbyParticipantStatus }>;
	now: number;
}) {
	if (lobby.checkInOpenedAt !== null) return true;

	return (
		now >= checkInOpensAt(lobby.startsAt) &&
		signedUpCount(participants) >= PLAYERS_PER_SET
	);
}

/** The lobby's {@link status} together with the {@link isCheckInOpen} it's derived from. */
export function statusAndCheckIn({
	lobby,
	participants,
	isPlaying,
	now,
}: {
	lobby: {
		startsAt: number;
		endedAt: number | null;
		checkInOpenedAt: number | null;
	};
	participants: Array<{ status: LobbyParticipantStatus }>;
	/** The room's latest set is unfinished */
	isPlaying: boolean;
	now: number;
}) {
	const checkInOpen = isCheckInOpen({ lobby, participants, now });

	return {
		status: status({ lobby, isPlaying, isCheckInOpen: checkInOpen, now }),
		isCheckInOpen: checkInOpen,
	};
}

/** Earliest check-in can open: some minutes before the start, if enough have signed up by then. */
export function checkInOpensAt(startsAt: number) {
	return startsAt - CHECK_IN_LEAD_MINUTES * SECONDS_PER_MINUTE;
}

/**
 * When the status next changes by the clock alone: check-in opening (if enough have signed up already), then the
 * start. `null` once started.
 */
export function nextStatusChangeAt({
	status: lobbyStatus,
	startsAt,
	participants,
}: {
	status: LobbyStatus;
	startsAt: number;
	participants: Array<{ status: LobbyParticipantStatus }>;
}) {
	if (
		lobbyStatus === "UPCOMING" &&
		signedUpCount(participants) >= PLAYERS_PER_SET
	) {
		return checkInOpensAt(startsAt);
	}
	if (lobbyStatus === "UPCOMING" || lobbyStatus === "CHECK_IN") return startsAt;

	return null;
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

/** What the viewer may do on the lobby page, see {@link viewerActions}. */
export interface ViewerActions {
	/** Sign up, or apply to a lobby requiring it */
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
	isKicked,
	application,
	isCheckInOpen: checkInOpen,
	activeCount: presentCount,
	roomSize,
	now,
	startsAt,
}: {
	status: LobbyStatus;
	viewer: { status: LobbyParticipantStatus } | null;
	isPlayingUnfinishedSet: boolean;
	hasFriendCode: boolean;
	/** The host kicked the viewer out of the lobby */
	isKicked: boolean;
	/** The viewer's application to the lobby, while it requires applying */
	application: LobbyApplicationState | null;
	/** See {@link isCheckInOpen} */
	isCheckInOpen: boolean;
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
			SIGN_UP: hasFriendCode && !isKicked && application === null,
			CHECK_IN: false,
			LEAVE: false,
			DROP_AFTER_SET: false,
		};
	}

	const hasStarted = now >= startsAt;
	const canCheckIn =
		checkInOpen &&
		(hasStarted
			? viewer.status !== "CHECKED_IN" &&
				viewer.status !== "IN_ROOM" &&
				presentCount < roomSize
			: viewer.status === "REGISTERED");

	return {
		SIGN_UP: false,
		CHECK_IN: canCheckIn,
		LEAVE: true,
		DROP_AFTER_SET: isPlayingUnfinishedSet,
	};
}

/** Participants present: checked in or in the room. */
export function activeCount(
	participants: Array<{ status: LobbyParticipantStatus }>,
) {
	return participants.filter(
		(p) => p.status === "IN_ROOM" || p.status === "CHECKED_IN",
	).length;
}

/** Participants holding a spot, i.e. everyone but the waitlisted. */
export function signedUpCount(
	participants: Array<{ status: LobbyParticipantStatus }>,
) {
	return participants.filter((p) => p.status !== "WAITLISTED").length;
}
