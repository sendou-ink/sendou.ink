import { add } from "date-fns";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { tournamentSubsPage } from "~/utils/urls";

const PICKUP_CHAT_EXPIRES_AFTER_DAYS = 7;

export function setPickupChatMetadata({
	team,
	tournament,
}: {
	team: {
		chatCode: string;
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
		chatCode: team.chatCode,
		header: team.name,
		subtitle: tournament.name,
		url: tournamentSubsPage(tournament.id),
		imageUrl: tournament.logoUrl ?? undefined,
		participantUserIds: team.memberUserIds,
		expiresAt: add(tournament.startTime, {
			days: PICKUP_CHAT_EXPIRES_AFTER_DAYS,
		}),
	});
}
