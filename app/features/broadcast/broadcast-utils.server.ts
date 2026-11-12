import { addDays, max } from "date-fns";
import { ServerConfig } from "~/config.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { isSameSecret } from "~/utils/crypto.server";
import { notFound } from "~/utils/remix.server";
import * as BroadcastRepository from "./BroadcastRepository.server";
import {
	BROADCAST_CHAT_ROOM_LIFESPAN_DAYS,
	LEAGUE_BROADCAST_CHAT_ROOM_LIFESPAN_DAYS,
} from "./broadcast-constants";
import type { BroadcastChannel, ProducerState } from "./broadcast-types";
import * as BroadcastHub from "./core/BroadcastHub.server";
import type * as Producer from "./core/Producer";

/** Whether the tournament's organization may use broadcast overlays, rolled out per organization. */
export function isBroadcastEnabled(tournament: {
	ctx: Pick<Tournament["ctx"], "organization">;
}) {
	if (ServerConfig.broadcastOrgIds === "*") return true;

	const organizationId = tournament.ctx.organization?.id;
	if (!organizationId) return false;

	return ServerConfig.broadcastOrgIds.includes(organizationId);
}

/** Producer pages are for the tournament's organizers and streamers. */
export function isBroadcastProducer(
	tournament: Tournament,
	user: { id: number } | undefined,
) {
	return (
		isBroadcastEnabled(tournament) && tournament.isOrganizerOrStreamer(user)
	);
}

/**
 * See {@link isBroadcastProducer}.
 *
 * @throws {Response} 404 if the user is not one or the tournament can't use broadcasts
 */
export function requireBroadcastProducer(
	tournament: Tournament,
	user: { id: number } | undefined,
) {
	if (!isBroadcastProducer(tournament, user)) notFound();
}

/**
 * Whether the user may watch the broadcast's program, the overlay page OBS shows and its stream: a producer, or
 * anyone with the broadcast's program key (OBS has no session). Without a key generated, only producers.
 */
export async function canWatchProgram({
	tournament,
	user,
	channel,
	programKey,
}: {
	tournament: Tournament;
	user: { id: number } | undefined;
	channel: Pick<BroadcastChannel, "platform" | "account">;
	programKey: string | null;
}) {
	if (isBroadcastProducer(tournament, user)) return true;
	if (!isBroadcastEnabled(tournament) || !programKey) return false;

	const broadcast = await BroadcastRepository.findByChannel({
		tournamentId: tournament.ctx.id,
		channel,
	});
	if (!broadcast?.programKey) return false;

	return isSameSecret(broadcast.programKey, programKey);
}

/** Gives the broadcast a new program key, disconnecting the OBS sources (and anyone else) watching with the old one. */
export async function regenerateProgramKey({
	tournamentId,
	channel,
	rules,
}: {
	tournamentId: number;
	channel: Pick<BroadcastChannel, "platform" | "account" | "slug">;
	rules: Producer.Rules<ProducerState>;
}) {
	const programKey = await BroadcastRepository.refreshProgramKey({
		tournamentId,
		channel,
		rules,
	});
	BroadcastHub.disconnectStaleKeys({
		tournamentId,
		slug: channel.slug,
		programKey,
	});
}

/**
 * Creates the chat room the tournament's organizers and streamers produce the channel's broadcast in, if the
 * tournament can use broadcasts and the room is missing. A broadcast created by it starts with the rules' scenes.
 */
export async function ensureChatRoom({
	tournament,
	channel,
	rules,
}: {
	tournament: Tournament;
	channel: Pick<BroadcastChannel, "platform" | "account">;
	rules: Producer.Rules<ProducerState>;
}) {
	if (!isBroadcastEnabled(tournament)) return;

	const { chatRoomId, isCreated } =
		await BroadcastRepository.insertChatRoomIfMissing({
			tournamentId: tournament.ctx.id,
			channel,
			rules,
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
