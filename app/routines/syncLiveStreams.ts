import { differenceInMinutes } from "date-fns";
import type { Tables } from "~/db/tables";
import { clearCombinedStreamsCache } from "~/features/core/streams/streams.server";
import * as LiveStream from "~/features/live-streams/core/LiveStream";
import type { StreamAccount } from "~/features/live-streams/live-streams-constants";
import * as LiveStreamRepository from "~/features/live-streams/LiveStreamRepository.server";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { getStreams } from "~/modules/twitch/streams";
import { hasTwitchEnvVars } from "~/modules/twitch/utils.server";
import { getLiveStreams as getYoutubeLiveStreams } from "~/modules/youtube/streams";
import { hasYoutubeEnvVars } from "~/modules/youtube/utils.server";
import { Routine } from "./routine.server";

const TOURNAMENT_STREAM_SYNC_INTERVAL_MINS = 30;
const YOUTUBE_SEARCH_INTERVAL_MINS = 20;
const YOUTUBE_SEARCH_INTERVAL_DURING_TOURNAMENTS_MINS = 10;
let lastTournamentStreamSync: Date | null = null;

export const SyncLiveStreamsRoutine = new Routine({
	name: "SyncLiveStreams",
	func: syncLiveStreams,
});

async function syncLiveStreams() {
	if (!hasTwitchEnvVars() && !hasYoutubeEnvVars()) return;

	const [twitchStreams, youtubeStreams] = await Promise.all([
		hasTwitchEnvVars() ? getStreams() : [],
		hasYoutubeEnvVars()
			? getYoutubeLiveStreams({
					searchIntervalMinutes:
						RunningTournaments.all.length > 0
							? YOUTUBE_SEARCH_INTERVAL_DURING_TOURNAMENTS_MINS
							: YOUTUBE_SEARCH_INTERVAL_MINS,
				})
			: [],
	]);

	const streams = [
		...twitchStreams.map((stream): Omit<LiveStreamRow, "userId"> => ({
			platform: "TWITCH",
			account: stream.twitchUserName,
			videoId: null,
			viewerCount: stream.viewerCount,
			thumbnailUrl: stream.thumbnailUrl,
		})),
		...youtubeStreams.map((stream): Omit<LiveStreamRow, "userId"> => ({
			platform: "YOUTUBE",
			account: stream.channelId,
			videoId: stream.videoId,
			viewerCount: stream.viewerCount,
			thumbnailUrl: stream.thumbnailUrl,
		})),
	];

	if (streams.length === 0) {
		await LiveStreamRepository.replaceAll([]);
		clearCombinedStreamsCache();
		return;
	}

	const accountToUserId = await streamAccountToUserId(streams);
	const liveStreams = streams.map((stream): LiveStreamRow => ({
		...stream,
		userId: accountToUserId.get(LiveStream.key(stream)) ?? null,
	}));

	await LiveStreamRepository.replaceAll(liveStreams);
	clearCombinedStreamsCache();

	await syncTournamentStreamers(liveStreams);
}

type LiveStreamRow = Omit<Tables["LiveStream"], "id">;

async function streamAccountToUserId(streams: StreamAccount[]) {
	const users = await UserRepository.findIdsByStreamAccounts({
		twitchNames: streams
			.filter((stream) => stream.platform === "TWITCH")
			.map((stream) => stream.account),
		youtubeIds: streams
			.filter((stream) => stream.platform === "YOUTUBE")
			.map((stream) => stream.account),
	});

	const result = new Map<string, number>();
	for (const user of users) {
		if (user.twitch) {
			result.set(
				LiveStream.key({ platform: "TWITCH", account: user.twitch }),
				user.id,
			);
		}
		if (user.youtubeId) {
			result.set(
				LiveStream.key({ platform: "YOUTUBE", account: user.youtubeId }),
				user.id,
			);
		}
	}

	return result;
}

async function syncTournamentStreamers(liveStreams: LiveStreamRow[]) {
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

	const liveKeys = new Set(liveStreams.map(LiveStream.key));

	const rows: Parameters<
		typeof LiveStreamRepository.insertTournamentStreamers
	>[0] = [];

	const participants = await TournamentRepository.findParticipantStreamAccounts(
		tournaments.map((tournament) => tournament.ctx.id),
	);

	for (const participant of participants) {
		for (const streamAccount of participant.streamAccounts) {
			if (!liveKeys.has(LiveStream.key(streamAccount))) continue;

			rows.push({
				userId: participant.userId,
				tournamentId: participant.tournamentId,
				platform: streamAccount.platform,
				account: streamAccount.account,
			});
		}
	}

	for (const tournament of tournaments) {
		for (const castAccount of tournament.ctx.castAccounts ?? []) {
			if (!liveKeys.has(LiveStream.key(castAccount))) continue;

			rows.push({
				userId: null,
				tournamentId: tournament.ctx.id,
				platform: castAccount.platform,
				account: castAccount.account,
			});
		}
	}

	await LiveStreamRepository.insertTournamentStreamers(rows);
	lastTournamentStreamSync = now;
}
