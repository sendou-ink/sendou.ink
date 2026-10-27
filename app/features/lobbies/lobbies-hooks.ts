import { useLoaderData } from "react-router";
import type { LobbyLoaderData, loader } from "./loaders/lobbies.$id.server";

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

	return {
		data,
		currentSet,
		roomMembers,
		/** Participants in line for a spot in the room, first in line first */
		waitlist,
		/** The room has formed at some point */
		hasStarted: roomMembers.length > 0 || currentSet !== null,
		viewerSide: data.viewer?.side ?? null,
		isViewerInRoom: data.viewer?.status === "IN_ROOM",
	};
}
