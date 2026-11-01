import * as R from "remeda";
import type { Tables } from "~/db/tables";
import * as LiveStream from "~/features/live-streams/core/LiveStream";
import type {
	StreamAccount,
	StreamPlatform,
} from "~/features/live-streams/live-streams-constants";
import * as TournamentMatchVodRepository from "~/features/tournament-bracket/TournamentMatchVodRepository.server";
import { hasTwitchEnvVars } from "~/modules/twitch/utils.server";
import {
	getArchiveVideos,
	getUsersByLogin,
	parseTwitchDuration,
} from "~/modules/twitch/vods";
import { hasYoutubeEnvVars } from "~/modules/youtube/utils.server";
import { findRecentLiveStreams } from "~/modules/youtube/vods";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { logger } from "~/utils/logger";
import { Routine } from "./routine.server";

const VOD_TIMESTAMP_OFFSET_SECONDS = 180;
const BRACKET_RESET_OFFSET_SECONDS = 0;

interface ArchivedStream {
	videoId: string;
	startSeconds: number;
	endSeconds: number;
	viewCount: number;
}

interface VodMatchRound {
	stageType: string;
	groupNumber: number;
	roundNumber: number;
}

export const SyncTournamentVodsRoutine = new Routine({
	name: "SyncTournamentVods",
	func: syncTournamentVods,
});

async function syncTournamentVods() {
	if (!hasTwitchEnvVars() && !hasYoutubeEnvVars()) return;

	const tournaments =
		await TournamentMatchVodRepository.findTournamentsNeedingVodSync();

	for (const tournament of tournaments) {
		try {
			const hadApiError = await processOneTournament(tournament.id);
			if (!hadApiError) {
				await TournamentMatchVodRepository.markVodSyncCompleted(tournament.id);
			}
		} catch (e) {
			logger.warn(`Failed to sync VODs for tournament ${tournament.id}: ${e}`);
		}
	}
}

/** @internal */
export async function processOneTournament(tournamentId: number) {
	const matches =
		await TournamentMatchVodRepository.findMatchesWithStartedAt(tournamentId);
	if (matches.length === 0) return false;

	// cast accounts (null userId) are handled via castedMatchHistory below
	const playerStreamers = (
		await TournamentMatchVodRepository.findStreamersByTournamentId(tournamentId)
	).filter(
		(streamer): streamer is typeof streamer & { userId: number } =>
			streamer.userId !== null && isPlatformSynced(streamer.platform),
	);
	const castedMatchHistory = (
		await TournamentMatchVodRepository.findCastedMatchHistoryByTournamentId(
			tournamentId,
		)
	).filter((entry) => isPlatformSynced(entry.platform));

	const { archivedStreamsByKey, hadApiError } = await fetchArchivedStreams(
		R.uniqueBy([...playerStreamers, ...castedMatchHistory], LiveStream.key),
	);

	const vods: Omit<Tables["TournamentMatchVod"], "id">[] = [];
	const addedVodKeys = new Set<string>();
	const addVod = ({
		match,
		streamAccount,
		userId,
	}: {
		match: (typeof matches)[number];
		streamAccount: StreamAccount;
		userId: number | null;
	}) => {
		const vodKey = `${match.id}-${streamAccount.account}`;
		if (!match.startedAt || addedVodKeys.has(vodKey)) return;

		const archivedStreams = archivedStreamsByKey.get(
			LiveStream.key(streamAccount),
		);
		if (!archivedStreams) return;

		const vodMatch = findMatchingVod(match.startedAt, match, archivedStreams);
		if (!vodMatch) return;

		vods.push({
			matchId: match.id,
			userId,
			platform: streamAccount.platform,
			account: streamAccount.account,
			...vodMatch,
		});
		addedVodKeys.add(vodKey);
	};

	for (const streamer of playerStreamers) {
		for (const match of matches) {
			if (!match.participants.some((p) => p.userId === streamer.userId)) {
				continue;
			}

			addVod({ match, streamAccount: streamer, userId: streamer.userId });
		}
	}

	const matchesById = new Map(matches.map((m) => [m.id, m]));
	for (const entry of castedMatchHistory) {
		const match = matchesById.get(entry.matchId);
		if (!match) continue;

		addVod({ match, streamAccount: entry, userId: null });
	}

	if (vods.length > 0) {
		await TournamentMatchVodRepository.insertMany(vods);
		logger.info(`Inserted ${vods.length} VODs for tournament ${tournamentId}`);
	}

	return hadApiError;
}

function isPlatformSynced(platform: StreamPlatform) {
	switch (platform) {
		case "TWITCH":
			return hasTwitchEnvVars();
		case "YOUTUBE":
			return hasYoutubeEnvVars();
	}
}

/** Archived streams of each account (by `LiveStream.key`), left out for accounts whose fetch failed. */
async function fetchArchivedStreams(streamAccounts: StreamAccount[]) {
	const archivedStreamsByKey = new Map<string, ArchivedStream[]>();
	let hadApiError = false;

	const twitchLogins = streamAccounts
		.filter((streamAccount) => streamAccount.platform === "TWITCH")
		.map((streamAccount) => streamAccount.account);
	const twitchUserIdByLogin = new Map(
		twitchLogins.length > 0
			? (await getUsersByLogin(twitchLogins)).map((user) => [
					user.login.toLowerCase(),
					user.id,
				])
			: [],
	);

	for (const streamAccount of streamAccounts) {
		try {
			archivedStreamsByKey.set(
				LiveStream.key(streamAccount),
				await fetchAccountArchivedStreams(streamAccount, twitchUserIdByLogin),
			);
		} catch (e) {
			logger.warn(`Failed to fetch VODs for ${streamAccount.account}: ${e}`);
			hadApiError = true;
		}
	}

	return { archivedStreamsByKey, hadApiError };
}

async function fetchAccountArchivedStreams(
	{ platform, account }: StreamAccount,
	twitchUserIdByLogin: Map<string, string>,
): Promise<ArchivedStream[]> {
	switch (platform) {
		case "TWITCH": {
			const twitchUserId = twitchUserIdByLogin.get(account.toLowerCase());
			if (!twitchUserId) return [];

			return (await getArchiveVideos(twitchUserId)).map((video) => {
				const startSeconds = dateToDatabaseTimestamp(
					new Date(video.created_at),
				);

				return {
					videoId: video.id,
					startSeconds,
					endSeconds: startSeconds + parseTwitchDuration(video.duration),
					viewCount: video.view_count,
				};
			});
		}
		case "YOUTUBE": {
			const nowSeconds = databaseTimestampNow();

			return (await findRecentLiveStreams(account)).map((stream) => ({
				videoId: stream.videoId,
				startSeconds: dateToDatabaseTimestamp(stream.startedAt),
				endSeconds: stream.endedAt
					? dateToDatabaseTimestamp(stream.endedAt)
					: nowSeconds,
				viewCount: stream.viewCount,
			}));
		}
	}
}

/** How many seconds past the match start the VoD timestamp of the match points to. */
export function vodTimestampOffsetSeconds(match: VodMatchRound) {
	const isBracketReset =
		match.stageType === "double_elimination" &&
		match.groupNumber === 3 &&
		match.roundNumber === 2;

	return isBracketReset
		? BRACKET_RESET_OFFSET_SECONDS
		: VOD_TIMESTAMP_OFFSET_SECONDS;
}

function findMatchingVod(
	matchStartSeconds: number,
	match: VodMatchRound,
	archivedStreams: ArchivedStream[],
) {
	const archivedStream = archivedStreams.find(
		(stream) =>
			matchStartSeconds >= stream.startSeconds &&
			matchStartSeconds <= stream.endSeconds,
	);
	if (!archivedStream) return null;

	return {
		platformVideoId: archivedStream.videoId,
		timestampSeconds:
			matchStartSeconds -
			archivedStream.startSeconds +
			vodTimestampOffsetSeconds(match),
		viewCount: archivedStream.viewCount,
	};
}
