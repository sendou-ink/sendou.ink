import { differenceInMinutes } from "date-fns";
import * as LiveStreamRepository from "~/features/live-streams/LiveStreamRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { getStreams } from "~/modules/twitch";
import { hasTwitchEnvVars } from "~/modules/twitch/utils.server";
import { Routine } from "./routine.server";

const TOURNAMENT_STREAM_SYNC_INTERVAL_MINS = 30;
let lastTournamentStreamSync: Date | null = null;

export const SyncLiveStreamsRoutine = new Routine({
	name: "SyncLiveStreams",
	func: syncLiveStreams,
});

async function syncLiveStreams() {
	if (!hasTwitchEnvVars()) return;

	const streams = await getStreams();

	if (streams.length === 0) {
		await LiveStreamRepository.replaceAll([]);
		return;
	}

	const streamTwitchNames = streams.map((s) => s.twitchUserName);
	const matchingUsers =
		await UserRepository.findIdsByTwitchUsernames(streamTwitchNames);

	const twitchToUserId = new Map<string, number>();
	for (const user of matchingUsers) {
		if (user.twitch) {
			twitchToUserId.set(user.twitch, user.id);
		}
	}

	const liveStreams = streams.map((stream) => ({
		userId: twitchToUserId.get(stream.twitchUserName) ?? null,
		viewerCount: stream.viewerCount,
		thumbnailUrl: stream.thumbnailUrl,
		twitch: stream.twitchUserName,
	}));

	await LiveStreamRepository.replaceAll(liveStreams);

	await syncTournamentStreamers(streams);
}

async function syncTournamentStreamers(
	streams: Awaited<ReturnType<typeof getStreams>>,
) {
	const now = new Date();
	if (
		lastTournamentStreamSync &&
		differenceInMinutes(now, lastTournamentStreamSync) <
			TOURNAMENT_STREAM_SYNC_INTERVAL_MINS
	) {
		return;
	}

	const tournaments = RunningTournaments.all;
	if (tournaments.length === 0) {
		lastTournamentStreamSync = now;
		return;
	}

	const streamsByTwitchName = new Map(
		streams.map((s) => [s.twitchUserName.toLowerCase(), s]),
	);

	const rows: Parameters<
		typeof LiveStreamRepository.insertTournamentStreamers
	>[0] = [];

	const participants = await TournamentRepository.findParticipantTwitchAccounts(
		tournaments.map((tournament) => tournament.ctx.id),
	);

	for (const participant of participants) {
		if (!streamsByTwitchName.has(participant.twitch.toLowerCase())) continue;

		rows.push({
			userId: participant.userId,
			tournamentId: participant.tournamentId,
			twitchAccount: participant.twitch,
		});
	}

	for (const tournament of tournaments) {
		for (const twitchAccount of tournament.ctx.castTwitchAccounts ?? []) {
			if (!streamsByTwitchName.has(twitchAccount.toLowerCase())) continue;

			rows.push({
				userId: null,
				tournamentId: tournament.ctx.id,
				twitchAccount,
			});
		}
	}

	await LiveStreamRepository.insertTournamentStreamers(rows);
	lastTournamentStreamSync = now;
}
