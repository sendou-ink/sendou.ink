import { addDays, max } from "date-fns";
import { ServerConfig } from "~/config.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { notFound } from "~/utils/remix.server";
import * as BroadcastRepository from "./BroadcastRepository.server";
import {
	BROADCAST_CHAT_ROOM_LIFESPAN_DAYS,
	LEAGUE_BROADCAST_CHAT_ROOM_LIFESPAN_DAYS,
} from "./broadcast-constants";
import type { BroadcastChannel } from "./broadcast-types";

/** Whether the tournament's organization may use broadcast overlays, rolled out per organization. */
export function isBroadcastEnabled(tournament: {
	ctx: Pick<Tournament["ctx"], "organization">;
}) {
	if (ServerConfig.broadcastOrgIds === "*") return true;

	const organizationId = tournament.ctx.organization?.id;
	if (!organizationId) return false;

	return ServerConfig.broadcastOrgIds.includes(organizationId);
}

/**
 * Producer pages are for the tournament's organizers and streamers.
 *
 * @throws {Response} 404 if the user is not one or the tournament can't use broadcasts
 */
export function requireBroadcastProducer(
	tournament: Tournament,
	user: { id: number } | undefined,
) {
	if (
		!isBroadcastEnabled(tournament) ||
		!tournament.isOrganizerOrStreamer(user)
	) {
		notFound();
	}
}

/** Creates the chat room the tournament's organizers and streamers produce the channel's broadcast in, if the tournament can use broadcasts and the room is missing. */
export async function ensureChatRoom({
	tournament,
	channel,
}: {
	tournament: Tournament;
	channel: Pick<BroadcastChannel, "platform" | "account">;
}) {
	if (!isBroadcastEnabled(tournament)) return;

	const { chatRoomId, isCreated } =
		await BroadcastRepository.insertChatRoomIfMissing({
			tournamentId: tournament.ctx.id,
			channel,
			expiresAt: addDays(
				max([tournament.ctx.startsAt, new Date()]),
				tournament.isLeague
					? LEAGUE_BROADCAST_CHAT_ROOM_LIFESPAN_DAYS
					: BROADCAST_CHAT_ROOM_LIFESPAN_DAYS,
			),
		});

	if (isCreated) {
		ChatSystemMessage.notifyRoomsChangedByRoomIds([chatRoomId]);
	}
}
