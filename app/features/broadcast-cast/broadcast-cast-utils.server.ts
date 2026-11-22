import type { Params } from "react-router";
import type { CastAccount } from "~/db/tables-json";
import * as BroadcastRepository from "~/features/broadcast/BroadcastRepository.server";
import {
	ensureChatRoom,
	findProgram,
	isBroadcastOngoing,
} from "~/features/broadcast/broadcast-utils.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as LiveStream from "~/features/live-streams/core/LiveStream";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { adminStreamFormSchemaServer } from "~/features/tournament-admin/tournament-admin-staff-schemas.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	clearTournamentDataCache,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentChannel } from "~/features/tournament-bracket/tournament-bracket-utils";
import { CAST_PRODUCER_RULES } from "./broadcast-cast-constants";
import * as CastChannel from "./core/CastChannel";

/**
 * The cast broadcast a user's OBS URL shows and how it mutes the capture card, by the URL's key (see `findProgram`),
 * `null` for an unknown key. `broadcast` is also `null` once its channel is no longer one of the tournament's cast
 * accounts.
 */
export async function findCastProgram(programKey: string | null) {
	const program = await findProgram(programKey);
	if (!program) return null;

	return {
		id: program.id,
		obsAudio: program.obsAudio,
		broadcast: program.shows ? castBroadcastOf(program.shows) : null,
	};
}

/**
 * The cast broadcast the user's scanner sends the games it sees to: the one their OBS URL shows, while its tournament
 * is on (see `isBroadcastOngoing`). `null` without one.
 */
export async function findScannerBroadcast(userId: number) {
	const setup = await BroadcastRepository.findProgram(userId);
	const program = await findProgram(setup?.programKey ?? null);
	const shows = program?.shows;
	if (!shows || !isBroadcastOngoing(shows.tournament)) return null;

	return castBroadcastOf(shows);
}

/** Body schema of the tournament's cast accounts form, for its organizers only. */
export async function castAccountsBodySchema({
	params,
}: {
	params: Params<string>;
}) {
	const { tournament } = await tournamentFromParams(params, {
		for: "organizer",
	});

	return adminStreamFormSchemaServer({
		currentCastAccounts: tournament.ctx.castAccounts ?? [],
	});
}

/** Saves the tournament's cast accounts, opening the broadcast chat room of each of their channels. */
export async function updateCastAccounts({
	tournament,
	castAccounts,
}: {
	tournament: Tournament;
	castAccounts: CastAccount[];
}) {
	await TournamentRepository.updateCastAccounts({
		tournamentId: tournament.ctx.id,
		castAccounts,
	});

	clearTournamentDataCache(tournament.ctx.id);
	ChatSystemMessage.send({ channel: tournamentChannel(tournament.ctx.id) });

	for (const channel of CastChannel.list(castAccounts)) {
		await ensureChatRoom({
			tournament,
			channel,
			rules: CAST_PRODUCER_RULES,
		});
	}
}

type ProgramShows = NonNullable<
	NonNullable<Awaited<ReturnType<typeof findProgram>>>["shows"]
>;

function castBroadcastOf(shows: ProgramShows) {
	const channel = CastChannel.list(shows.tournament.ctx.castAccounts).find(
		(candidate) => LiveStream.isSameAccount(candidate, shows.channel),
	);
	if (!channel) return null;

	return { tournamentId: shows.tournament.ctx.id, slug: channel.slug };
}
