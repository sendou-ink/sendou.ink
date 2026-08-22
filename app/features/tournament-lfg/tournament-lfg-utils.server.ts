import { add } from "date-fns";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as EventBus from "~/features/events/core/EventBus.server";
import { tournamentSubsPage } from "~/utils/urls";
import * as TournamentLFGRepository from "./TournamentLFGRepository.server";

const PICKUP_CHAT_EXPIRES_AFTER_DAYS = 7;

/** When a pickup chat room expires: shortly after the tournament so it lasts through the event. */
export function pickupChatRoomExpiresAt(tournamentStartTime: Date) {
	return add(tournamentStartTime, { days: PICKUP_CHAT_EXPIRES_AFTER_DAYS });
}

export function setPickupChatMetadata({
	team,
	tournament,
}: {
	team: {
		chatRoomId: number;
		name: string;
		memberUserIds: number[];
	};
	tournament: {
		id: number;
		name: string;
		logoUrl: string | null;
		startTime: Date;
	};
}) {
	return ChatSystemMessage.setMetadata({
		chatCode: EventBus.chatRoomChannel(team.chatRoomId),
		header: team.name,
		subtitle: tournament.name,
		url: tournamentSubsPage(tournament.id),
		imageUrl: tournament.logoUrl ?? undefined,
		participantUserIds: team.memberUserIds,
		expiresAt: pickupChatRoomExpiresAt(tournament.startTime),
	});
}

/** Re-pushes the pickup chat participant list after a roster change; no-op if the team has no chat. */
export async function syncPickupChatMetadata({
	teamId,
	tournament,
}: {
	teamId: number;
	tournament: {
		id: number;
		name: string;
		logoUrl: string | null;
		startTime: Date;
	};
}) {
	const team = await TournamentLFGRepository.findPickupChatTeamById(teamId);
	if (!team) return;

	await setPickupChatMetadata({ team, tournament });
}
