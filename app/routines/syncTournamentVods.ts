import type { Insertable } from "kysely";
import type { DB } from "~/db/tables";
import * as TournamentMatchVodRepository from "~/features/tournament-bracket/TournamentMatchVodRepository.server";
import { hasTwitchEnvVars } from "~/modules/twitch/utils";
import {
	getArchiveVideos,
	getUsersByLogin,
	parseTwitchDuration,
} from "~/modules/twitch/vods";
import { logger } from "~/utils/logger";
import { Routine } from "./routine.server";

const VOD_TIMESTAMP_OFFSET_SECONDS = 180;
const BRACKET_RESET_OFFSET_SECONDS = 0;

export const SyncTournamentVodsRoutine = new Routine({
	name: "SyncTournamentVods",
	func: syncTournamentVods,
});

async function syncTournamentVods() {
	if (!hasTwitchEnvVars()) return;

	const tournaments =
		await TournamentMatchVodRepository.findFinalizedTournamentsNeedingVods();

	for (const tournament of tournaments) {
		await processOneTournament(tournament.id);
	}
}

export async function processOneTournament(tournamentId: number) {
	const matches =
		await TournamentMatchVodRepository.findMatchesWithStartedAt(tournamentId);
	if (matches.length === 0) return;

	const matchesById = new Map(matches.map((m) => [m.id, m]));
	const loginToTwitchId = new Map<string, string>();
	const vods: Insertable<DB["TournamentMatchVod"]>[] = [];

	// Player stream VODs
	const streamers =
		await TournamentMatchVodRepository.findStreamersByTournamentId(
			tournamentId,
		);

	if (streamers.length > 0) {
		const twitchUsers = await getUsersByLogin(
			streamers.map((s) => s.twitchAccount),
		);
		for (const u of twitchUsers) {
			loginToTwitchId.set(u.login.toLowerCase(), u.id);
		}

		const participantsByMatch = new Map(
			matches.map((m) => [m.id, new Set(m.participants.map((p) => p.userId))]),
		);

		const streamerDbUserIds = new Map(
			streamers
				.filter((s) => s.userId !== null)
				.map((s) => [s.twitchAccount.toLowerCase(), s.userId!]),
		);

		for (const streamer of streamers) {
			const twitchUserId = loginToTwitchId.get(
				streamer.twitchAccount.toLowerCase(),
			);
			if (!twitchUserId) continue;

			const videos = await fetchArchiveVideos(
				twitchUserId,
				streamer.twitchAccount,
			);
			if (!videos) continue;

			const dbUserId =
				streamerDbUserIds.get(streamer.twitchAccount.toLowerCase()) ?? null;

			for (const match of matches) {
				if (!match.startedAt) continue;

				if (dbUserId !== null) {
					const matchParticipants = participantsByMatch.get(match.id);
					if (!matchParticipants?.has(dbUserId)) continue;
				}

				const vodMatch = findMatchingVod(match.startedAt, match, videos);
				if (!vodMatch) continue;

				vods.push({
					matchId: match.id,
					userId: dbUserId,
					platform: "TWITCH",
					account: streamer.twitchAccount,
					...vodMatch,
				});
			}
		}
	}

	// Cast stream VODs
	const castedMatchHistory =
		await TournamentMatchVodRepository.findCastedMatchHistoryByTournamentId(
			tournamentId,
		);

	if (castedMatchHistory.length > 0) {
		const castMatchesByAccount = new Map<string, Set<number>>();
		for (const entry of castedMatchHistory) {
			if (!castMatchesByAccount.has(entry.twitchAccount)) {
				castMatchesByAccount.set(entry.twitchAccount, new Set());
			}
			castMatchesByAccount.get(entry.twitchAccount)!.add(entry.matchId);
		}

		const newCastLogins = [...castMatchesByAccount.keys()].filter(
			(account) => !loginToTwitchId.has(account.toLowerCase()),
		);
		if (newCastLogins.length > 0) {
			const newUsers = await getUsersByLogin(newCastLogins);
			for (const u of newUsers) {
				loginToTwitchId.set(u.login.toLowerCase(), u.id);
			}
		}

		const addedVodKeys = new Set(vods.map((v) => `${v.matchId}-${v.account}`));

		for (const [account, matchIds] of castMatchesByAccount) {
			const twitchUserId = loginToTwitchId.get(account.toLowerCase());
			if (!twitchUserId) continue;

			const videos = await fetchArchiveVideos(twitchUserId, account);
			if (!videos) continue;

			for (const matchId of matchIds) {
				const match = matchesById.get(matchId);
				if (!match?.startedAt) continue;

				const vodKey = `${matchId}-${account}`;
				if (addedVodKeys.has(vodKey)) continue;

				const vodMatch = findMatchingVod(match.startedAt, match, videos);
				if (!vodMatch) continue;

				vods.push({
					matchId,
					userId: null,
					platform: "TWITCH",
					account,
					...vodMatch,
				});
				addedVodKeys.add(vodKey);
			}
		}
	}

	if (vods.length > 0) {
		await TournamentMatchVodRepository.insertMany(vods);
		logger.info(`Inserted ${vods.length} VODs for tournament ${tournamentId}`);
	}
}

async function fetchArchiveVideos(twitchUserId: string, accountName: string) {
	try {
		const videos = await getArchiveVideos(twitchUserId);
		return videos.length > 0 ? videos : null;
	} catch (e) {
		logger.warn(`Failed to fetch VODs for ${accountName}: ${e}`);
		return null;
	}
}

function findMatchingVod(
	matchStartSeconds: number,
	match: { stageType: string; groupNumber: number; roundNumber: number },
	videos: NonNullable<Awaited<ReturnType<typeof fetchArchiveVideos>>>,
) {
	for (const video of videos) {
		const vodStartSeconds = Math.floor(
			new Date(video.created_at).getTime() / 1000,
		);
		const vodDurationSeconds = parseTwitchDuration(video.duration);
		const vodEndSeconds = vodStartSeconds + vodDurationSeconds;

		if (
			matchStartSeconds >= vodStartSeconds &&
			matchStartSeconds <= vodEndSeconds
		) {
			const isBracketReset =
				match.stageType === "double_elimination" &&
				match.groupNumber === 3 &&
				match.roundNumber === 2;
			const offsetSeconds = isBracketReset
				? BRACKET_RESET_OFFSET_SECONDS
				: VOD_TIMESTAMP_OFFSET_SECONDS;
			const timestampSeconds =
				matchStartSeconds - vodStartSeconds + offsetSeconds;

			return {
				platformVideoId: video.id,
				timestampSeconds,
				viewCount: video.view_count,
			};
		}
	}

	return null;
}
