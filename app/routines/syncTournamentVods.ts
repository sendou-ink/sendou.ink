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
	const streamers =
		await TournamentMatchVodRepository.findStreamersByTournamentId(
			tournamentId,
		);
	if (streamers.length === 0) return;

	const twitchLogins = streamers.map((s) => s.twitchAccount);
	const twitchUsers = await getUsersByLogin(twitchLogins);

	const loginToUserId = new Map(
		twitchUsers.map((u) => [u.login.toLowerCase(), u.id]),
	);

	const matches =
		await TournamentMatchVodRepository.findMatchesWithStartedAt(tournamentId);

	const participantsByMatch = new Map(
		matches.map((m) => [m.id, new Set(m.participants.map((p) => p.userId))]),
	);

	const streamerDbUserIds = new Map(
		streamers
			.filter((s) => s.userId !== null)
			.map((s) => [s.twitchAccount.toLowerCase(), s.userId!]),
	);

	const vods: Insertable<DB["TournamentMatchVod"]>[] = [];

	for (const streamer of streamers) {
		const twitchUserId = loginToUserId.get(
			streamer.twitchAccount.toLowerCase(),
		);
		if (!twitchUserId) continue;

		let videos: Awaited<ReturnType<typeof getArchiveVideos>>;
		try {
			videos = await getArchiveVideos(twitchUserId);
		} catch (e) {
			logger.warn(`Failed to fetch VODs for ${streamer.twitchAccount}: ${e}`);
			continue;
		}

		if (videos.length === 0) continue;

		const dbUserId =
			streamerDbUserIds.get(streamer.twitchAccount.toLowerCase()) ?? null;

		for (const match of matches) {
			if (!match.startedAt) continue;

			if (dbUserId !== null) {
				const matchParticipants = participantsByMatch.get(match.id);
				if (!matchParticipants?.has(dbUserId)) continue;
			}

			const matchStartSeconds = match.startedAt;

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

					vods.push({
						matchId: match.id,
						userId: dbUserId,
						platform: "TWITCH",
						account: streamer.twitchAccount,
						vodId: video.id,
						timestampSeconds,
						viewCount: video.view_count,
					});
					break;
				}
			}
		}
	}

	if (vods.length > 0) {
		await TournamentMatchVodRepository.insertMany(vods);
		logger.info(`Inserted ${vods.length} VODs for tournament ${tournamentId}`);
	}
}
