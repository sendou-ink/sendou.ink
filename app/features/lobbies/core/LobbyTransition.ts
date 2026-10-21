import {
	type LobbyParticipantStatus,
	PLAYERS_PER_SET,
} from "../lobbies-constants";
import * as LobbySet from "./LobbySet";
import * as LobbyState from "./LobbyState";
import * as Waitlist from "./Waitlist";

/** Everything the next transition of a lobby is decided from. */
export interface ProgressionState {
	lobby: {
		hostUserId: number;
		startsAt: number;
		roomSize: number;
		pendingSince: number | null;
		endedAt: number | null;
	};
	/** In sign-up order */
	participants: Array<{
		userId: number;
		status: LobbyParticipantStatus;
		joinedAt: number;
		isDroppingAfterSet: boolean;
		/** Set by the host, takes a room slot but plays no sets */
		isSittingOut: boolean;
	}>;
	latestSet:
		| (LobbySet.SetLike & {
				/** Latest map report or the set's start */
				lastActivityAt: number;
		  })
		| null;
	readyChecks: Array<{
		id: number;
		expiresAt: number;
		users: Array<{ userId: number; confirmedAt: number | null }>;
	}>;
}

/** A change to the lobby's state, applied by `LobbyProgression.advance` one at a time. */
export type Transition =
	| { type: "END" }
	| { type: "TRANSFER_HOST"; userId: number }
	/** Before the start: waitlisted get spots freed in the room */
	| { type: "PROMOTE"; userIds: number[] }
	/** Fills the room with the checked in, once those who didn't check in are removed */
	| { type: "START"; userIds: number[] }
	| { type: "REMOVE"; userIds: number[] }
	| { type: "START_SET" }
	| { type: "OPEN_SLOT_CHECK" }
	/** Moves participants into the room's free slots */
	| { type: "FILL_SLOTS"; userIds: number[] }
	| { type: "CLOSE_CHECK"; readyCheckId: number }
	| { type: "SET_PENDING_SINCE"; pendingSince: number | null };

/**
 * The next transition the lobby should go through, `null` when it's settled. Applying the result and asking
 * again eventually settles: every transition moves the lobby closer to a state where nothing is due.
 */
export function next(state: ProgressionState, now: number): Transition | null {
	if (state.lobby.endedAt !== null) return null;

	const { lobby, participants, latestSet } = state;
	const hasStarted = now >= lobby.startsAt;
	const isPlaying = latestSet !== null && !LobbySet.isFinished(latestSet);

	if (participants.length === 0) {
		return hasStarted ? { type: "END" } : null;
	}

	if (!participants.some((p) => p.userId === lobby.hostUserId)) {
		const userId = LobbyState.nextHost(participants);
		if (userId !== null) return { type: "TRANSFER_HOST", userId };
	}

	const status = LobbyState.status({ lobby, isPlaying, now });
	if (
		LobbyState.isAutoCloseDue({
			status,
			lastActivityAt: isPlaying ? latestSet.lastActivityAt : null,
			pendingSince: lobby.pendingSince,
			now,
		})
	) {
		return { type: "END" };
	}

	if (!hasStarted) return promotions(state);

	const memberIds = roomMemberIds(state);
	if (memberIds.length === 0 && latestSet === null) {
		const checkedIn = participants
			.filter((p) => p.status === "CHECKED_IN")
			.map((p) => p.userId);
		if (checkedIn.length >= PLAYERS_PER_SET) {
			const notCheckedIn = participants
				.filter((p) => p.status === "REGISTERED" || p.status === "WAITLISTED")
				.map((p) => p.userId);
			if (notCheckedIn.length > 0) {
				return { type: "REMOVE", userIds: notCheckedIn };
			}

			return { type: "START", userIds: checkedIn.slice(0, lobby.roomSize) };
		}

		return pendingSinceTransition(state, false, now);
	}

	const playing = new Set(
		isPlaying
			? latestSet.participants
					.filter((participant) => participant.side !== null)
					.map((participant) => participant.userId)
			: [],
	);
	const leaving = participants.filter(
		(p) => p.isDroppingAfterSet && !playing.has(p.userId),
	);
	if (leaving.length > 0) {
		return { type: "REMOVE", userIds: leaving.map((p) => p.userId) };
	}

	return (
		readyCheckTransition(state, memberIds, now) ??
		placementTransition(state, memberIds) ??
		slotCheckTransition(state, memberIds, isPlaying) ??
		setTransition(state, isPlaying) ??
		pendingSinceTransition(state, isPlaying, now)
	);
}

/** Queue of the waitlist, everyone not in the room, highest first. */
export function waitlist(state: Pick<ProgressionState, "participants">) {
	return state.participants
		.filter((p) => p.status !== "IN_ROOM")
		.map((p) => p.userId);
}

function roomMemberIds(state: ProgressionState) {
	return state.participants
		.filter((p) => p.status === "IN_ROOM")
		.map((p) => p.userId);
}

function promotions(state: ProgressionState): Transition | null {
	const withSpot = state.participants.filter(
		(p) => p.status === "REGISTERED" || p.status === "CHECKED_IN",
	);
	const freeSpots = state.lobby.roomSize - withSpot.length;
	if (freeSpots <= 0) return null;

	const userIds = state.participants
		.filter((p) => p.status === "WAITLISTED")
		.slice(0, freeSpots)
		.map((p) => p.userId);

	return userIds.length > 0 ? { type: "PROMOTE", userIds } : null;
}

function readyCheckTransition(
	state: ProgressionState,
	memberIds: number[],
	now: number,
): Transition | null {
	for (const check of state.readyChecks) {
		const slotCount = state.lobby.roomSize - memberIds.length;
		if (slotCount <= 0) {
			return { type: "CLOSE_CHECK", readyCheckId: check.id };
		}

		const queue = waitlist(state);
		const winners = Waitlist.slotWinners({
			slotCount,
			queue,
			confirmedAtByUserId: new Map(
				check.users.flatMap((user) =>
					user.confirmedAt !== null && queue.includes(user.userId)
						? [[user.userId, user.confirmedAt] as const]
						: [],
				),
			),
			priorityEndsAt: check.expiresAt,
			now,
		});
		if (winners.length > 0) {
			return { type: "FILL_SLOTS", userIds: winners };
		}
	}

	return null;
}

/** Present participants waiting for a spot fill the room's free slots. */
function placementTransition(
	state: ProgressionState,
	memberIds: number[],
): Transition | null {
	const slotCount = state.lobby.roomSize - memberIds.length;
	if (slotCount <= 0) return null;

	const userIds = state.participants
		.filter((p) => p.status === "CHECKED_IN")
		.slice(0, slotCount)
		.map((p) => p.userId);

	return userIds.length > 0 ? { type: "FILL_SLOTS", userIds } : null;
}

function slotCheckTransition(
	state: ProgressionState,
	memberIds: number[],
	isPlaying: boolean,
): Transition | null {
	if (playableMemberCount(state) >= PLAYERS_PER_SET || isPlaying) return null;
	if (memberIds.length >= state.lobby.roomSize) return null;
	if (state.readyChecks.length > 0 || waitlist(state).length === 0) {
		return null;
	}

	return { type: "OPEN_SLOT_CHECK" };
}

function setTransition(
	state: ProgressionState,
	isPlaying: boolean,
): Transition | null {
	if (isPlaying || playableMemberCount(state) < PLAYERS_PER_SET) return null;

	return { type: "START_SET" };
}

function playableMemberCount(state: ProgressionState) {
	return state.participants.filter(
		(p) => p.status === "IN_ROOM" && !p.isSittingOut,
	).length;
}

function pendingSinceTransition(
	state: ProgressionState,
	isPlaying: boolean,
	now: number,
): Transition | null {
	if (isPlaying && state.lobby.pendingSince !== null) {
		return { type: "SET_PENDING_SINCE", pendingSince: null };
	}
	if (!isPlaying && state.lobby.pendingSince === null) {
		return { type: "SET_PENDING_SINCE", pendingSince: now };
	}

	return null;
}
