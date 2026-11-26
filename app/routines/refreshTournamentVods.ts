import { addDays } from "date-fns";
import * as R from "remeda";
import * as TournamentMatchVodRepository from "~/features/tournament-bracket/TournamentMatchVodRepository.server";
import { hasTwitchEnvVars } from "~/modules/twitch/utils.server";
import {
	getVideosByIds,
	MAX_VIDEO_IDS_PER_REQUEST,
} from "~/modules/twitch/vods";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { logger } from "~/utils/logger";
import { Routine } from "./routine.server";

const MAX_REQUESTS_PER_RUN = 5;
/** Videos outliving their earliest possible expiry may be of a Prime/Turbo user, kept for up to 60 days. */
const RECHECK_INTERVAL_DAYS = 1;

/**
 * Deletes the Twitch VoDs whose video Twitch has removed and refreshes the view counts of the rest. Only videos
 * past their `checkAfter` are looked up and the pass stops at the first failed request, so an API error or a rate
 * limit never deletes anything.
 */
export const RefreshTournamentVodsRoutine = new Routine({
	name: "RefreshTournamentVods",
	func: refreshTournamentVods,
});

async function refreshTournamentVods() {
	if (!hasTwitchEnvVars()) return;

	const videoIds =
		await TournamentMatchVodRepository.findTwitchVideoIdsDueCheck(
			MAX_VIDEO_IDS_PER_REQUEST * MAX_REQUESTS_PER_RUN,
		);

	let removedCount = 0;
	let foundCount = 0;
	for (const batch of R.chunk(videoIds, MAX_VIDEO_IDS_PER_REQUEST)) {
		let videos: Awaited<ReturnType<typeof getVideosByIds>>;
		try {
			videos = await getVideosByIds(batch);
		} catch (e) {
			logger.warn(`Stopped checking Twitch VoDs: ${e}`);
			break;
		}

		const viewCountByVideoId = new Map(
			videos.map((video) => [video.id, video.view_count]),
		);
		const foundVideos = batch.flatMap((videoId) => {
			const viewCount = viewCountByVideoId.get(videoId);
			return viewCount === undefined ? [] : [{ videoId, viewCount }];
		});
		const removedVideoIds = batch.filter(
			(videoId) => !viewCountByVideoId.has(videoId),
		);

		await TournamentMatchVodRepository.saveTwitchVideoCheck({
			removedVideoIds,
			foundVideos,
			nextCheckAfter: dateToDatabaseTimestamp(
				addDays(new Date(), RECHECK_INTERVAL_DAYS),
			),
		});

		removedCount += removedVideoIds.length;
		foundCount += foundVideos.length;
	}

	if (videoIds.length > 0) {
		logger.info(
			`Checked Twitch VoDs: ${foundCount} still up, ${removedCount} removed`,
		);
	}
}
