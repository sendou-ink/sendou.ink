import * as React from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { resolveRoomPass } from "~/components/match-page/utils";
import { databaseTimestampToDate } from "~/utils/dates";
import * as LobbyState from "./core/LobbyState";
import type { LobbyLoaderData, loader } from "./loaders/lobbies.$id.server";

// past the server's second-precision clock flipping the status too
const STATUS_CHANGE_MARGIN_MS = 1000;
// our clock ran ahead of the server's, it still told the old status
const STATUS_CHANGE_RETRY_MS = 5000;
const MAX_STATUS_CHANGE_WAIT_MS = 24 * 60 * 60 * 1000;

export type LobbySetData = LobbyLoaderData["sets"][number];

/** The lobby page's data plus the room's current set and members. */
export function useLobbyView() {
	const data = useLoaderData<typeof loader>();

	const currentSet = data.sets.at(-1) ?? null;
	const roomMembers = data.lobby.participants.filter(
		(participant) => participant.status === "IN_ROOM",
	);
	const isBeforeStart =
		data.status === "UPCOMING" || data.status === "CHECK_IN";
	const waitlist = data.lobby.participants.filter((participant) =>
		isBeforeStart
			? participant.status === "WAITLISTED"
			: participant.status !== "IN_ROOM",
	);
	const hasPlaceInRoom =
		data.viewer?.status === (isBeforeStart ? "CHECKED_IN" : "IN_ROOM");

	return {
		data,
		currentSet,
		roomMembers,
		/** Participants in line for a spot in the room, first in line first */
		waitlist,
		/** The room has formed at some point */
		hasStarted: roomMembers.length > 0 || currentSet !== null,
		viewerSide: data.viewer?.side ?? null,
		/** The in-game private battle to join, shown to those with a place in the room */
		joinInfo: hasPlaceInRoom
			? {
					pool: `LB${(data.lobby.id % 9) + 1}`,
					pass: resolveRoomPass(data.lobby.id),
				}
			: null,
	};
}

/** Revalidates as the lobby's status changes by the clock alone (check-in opening, the start), which no live event announces. */
export function useRevalidateOnStatusChange() {
	const { data } = useLobbyView();
	const { revalidate } = useRevalidator();

	const changesAt = LobbyState.nextStatusChangeAt({
		status: data.status,
		startsAt: data.lobby.startsAt,
	});

	React.useEffect(() => {
		if (changesAt === null) return;

		const remainingMs =
			databaseTimestampToDate(changesAt).getTime() - Date.now();
		if (remainingMs > MAX_STATUS_CHANGE_WAIT_MS) return;

		const timeout = setTimeout(
			revalidate,
			remainingMs > 0
				? remainingMs + STATUS_CHANGE_MARGIN_MS
				: STATUS_CHANGE_RETRY_MS,
		);

		return () => clearTimeout(timeout);
		// data: a revalidation still telling the old status tries again
	}, [changesAt, data, revalidate]);
}
