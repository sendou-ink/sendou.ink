/**
 * Keeps the voice calls of a lobby's chats to those still in them: a user who leaves the lobby, or sits out
 * the next set, is ejected from the calls they no longer belong in.
 */

import * as VoiceEject from "~/features/voice/core/VoiceEject.server";
import type * as LobbyMatchRepository from "../LobbyMatchRepository.server";
import { LOBBY_SIDES } from "../lobbies-constants";
import * as LobbySet from "./LobbySet";

type SetWithChats = LobbyMatchRepository.LobbySetWithGames;

/** Ends the calls of users no longer in the lobby, in its chat and their team's chat of the latest set. */
export function ejectLeavers({
	lobby,
	latestSet,
	userIds,
}: {
	lobby: { chatRoomId: number | null; participantUserIds: number[] };
	latestSet: SetWithChats | undefined;
	userIds: number[];
}) {
	if (lobby.chatRoomId !== null) {
		void VoiceEject.ejectUsers({
			room: {
				roomId: lobby.chatRoomId,
				participantUserIds: lobby.participantUserIds,
			},
			userIds,
		});
	}

	if (latestSet) ejectFromTeamChats({ set: latestSet, userIds });
}

/** Ends the calls in the previous set's team chats of its players who don't play the next set. */
export function ejectSittingOut({
	previousSet,
	playingUserIds,
}: {
	previousSet: SetWithChats;
	playingUserIds: number[];
}) {
	ejectFromTeamChats({
		set: previousSet,
		userIds: previousSet.participants
			.filter(
				(participant) =>
					participant.side !== null &&
					!playingUserIds.includes(participant.userId),
			)
			.map((participant) => participant.userId),
	});
}

function ejectFromTeamChats({
	set,
	userIds,
}: {
	set: SetWithChats;
	userIds: number[];
}) {
	for (const side of LOBBY_SIDES) {
		const roomId = side === "ALPHA" ? set.alphaChatRoomId : set.bravoChatRoomId;
		const playerIds = LobbySet.playersOf(set, side);
		const ejectedIds = userIds.filter((userId) => playerIds.includes(userId));
		if (roomId === null || ejectedIds.length === 0) continue;

		void VoiceEject.ejectUsers({
			room: { roomId, participantUserIds: playerIds },
			userIds: ejectedIds,
		});
	}
}
