import { addDays, max, subDays } from "date-fns";
import { ServerConfig } from "~/config.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { notFound } from "~/utils/remix.server";
import * as BroadcastRepository from "./BroadcastRepository.server";
import {
	BROADCAST_CHAT_ROOM_LIFESPAN_DAYS,
	BROADCAST_ONGOING_LEAD_DAYS,
	LEAGUE_BROADCAST_CHAT_ROOM_LIFESPAN_DAYS,
} from "./broadcast-constants";
import type {
	BroadcastChannel,
	BroadcastObsAudio,
	ProducerState,
} from "./broadcast-types";
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

/**
 * Producer pages are for the tournament's organizers and streamers.
 * @internal
 */
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
export function requireBroadcastProducer<User extends { id: number }>(
	tournament: Tournament,
	user: User | undefined,
): asserts user is User {
	if (!isBroadcastProducer(tournament, user)) notFound();
}

/**
 * The OBS URL of the program key: its id, whose it is, how it mutes the capture card and the tournament broadcast it
 * shows, `null` for an unknown key. `shows` is `null` while the URL isn't pointed at a broadcast, or once its user can't
 * produce that one anymore.
 */
export async function findProgram(programKey: string | null) {
	if (!programKey) return null;

	const program = await BroadcastRepository.findProgramByKey(programKey);
	if (!program) return null;

	const { tournamentId, platform, account, ...rest } = program;
	const tournament =
		tournamentId === null ? null : await tournamentFromDB(tournamentId);
	if (
		!tournament ||
		!platform ||
		!account ||
		!isBroadcastProducer(tournament, { id: rest.userId })
	) {
		return { ...rest, shows: null };
	}

	return { ...rest, shows: { tournament, channel: { platform, account } } };
}

/**
 * Points the user's OBS URL at the channel's broadcast in the tournament (generating the URL if the user has none),
 * reloading the OBS sources showing it onto this one. Returns the URL's key.
 */
export async function pointProgram({
	userId,
	tournamentId,
	channel,
	rules,
}: {
	userId: number;
	tournamentId: number;
	channel: Pick<BroadcastChannel, "platform" | "account" | "slug">;
	rules: Producer.Rules<ProducerState>;
}) {
	const program = await BroadcastRepository.pointProgram({
		userId,
		tournamentId,
		channel,
		rules,
	});
	BroadcastHub.reloadProgram({
		programId: program.id,
		except: { tournamentId, slug: channel.slug },
	});

	return program.programKey;
}

/**
 * Sets how the user's OBS URL mutes the capture card, the OBS sources using it following right away. Returns whether
 * the user has a URL.
 */
export async function updateObsAudio(args: {
	userId: number;
	obsAudio: BroadcastObsAudio | null;
}) {
	const program = await BroadcastRepository.updateObsAudio(args);
	if (!program) return false;

	BroadcastHub.sendObsAudio({ programId: program.id, obsAudio: args.obsAudio });

	return true;
}

/**
 * Gives the user's OBS URL a new key, disconnecting the OBS sources (and anyone else) watching with the old one.
 * Returns the new key, `null` without a URL.
 */
export async function regenerateProgramKey(userId: number) {
	const program = await BroadcastRepository.refreshProgramKey(userId);
	if (!program) return null;

	BroadcastHub.closeProgram(program.id);

	return program.programKey;
}

/**
 * Whether the tournament's broadcasts are on: from a day before it starts until it is finalized, at most as long as
 * their chat rooms live. A user's scanner follows the broadcast their OBS URL shows only meanwhile, so scanning their
 * own games between tournaments doesn't touch an old one.
 */
export function isBroadcastOngoing(
	tournament: {
		ctx: Pick<Tournament["ctx"], "isFinalized" | "startsAt">;
		isLeague: boolean;
	},
	now = new Date(),
) {
	if (tournament.ctx.isFinalized) return false;

	const { startsAt } = tournament.ctx;

	return (
		now >= subDays(startsAt, BROADCAST_ONGOING_LEAD_DAYS) &&
		now < addDays(startsAt, lifespanDays(tournament))
	);
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
				lifespanDays(tournament),
			),
		});

	if (isCreated) {
		ChatSystemMessage.notifyRoomsChangedByRoomIds([chatRoomId]);
	}
}

function lifespanDays(tournament: { isLeague: boolean }) {
	return tournament.isLeague
		? LEAGUE_BROADCAST_CHAT_ROOM_LIFESPAN_DAYS
		: BROADCAST_CHAT_ROOM_LIFESPAN_DAYS;
}
