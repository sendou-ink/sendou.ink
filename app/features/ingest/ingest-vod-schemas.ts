import { add } from "date-fns";
import { z } from "zod";
import { videoMatchTypes } from "~/features/vods/vods-constants";
import { extractYoutubeIdFromVideoUrl } from "~/features/vods/vods-utils";
import { dayMonthYearToDate } from "~/utils/dates";
import { dayMonthYear, id, nonEmptyString } from "~/utils/zod";

const detectionText = z.string().max(500);

/** One detected match of an emberz VoD scan (src/core/vod-matches.ts). */
const ingestVodMatchSchema = z.object({
	/** whole seconds into the video the match starts at */
	startsAt: z.number().int().min(0),
	/** English mode name; null when no source read it */
	mode: detectionText.nullable(),
	/** English stage name; null when no source read it */
	stage: detectionText.nullable(),
	/** the match's weapons (sendou main-weapon-id strings, or "unknown") */
	weapons: z.array(detectionText).max(16),
});

export const ingestVodBodySchema = z.object({
	type: z.enum(videoMatchTypes),
	youtubeUrl: z
		.string()
		.max(200)
		.refine((val) => extractYoutubeIdFromVideoUrl(val) !== null, {
			message: "Invalid YouTube URL",
		}),
	title: nonEmptyString.max(100),
	date: dayMonthYear.refine(
		(data) => dayMonthYearToDate(data) < add(new Date(), { days: 1 }),
		{ message: "Date must not be in the future" },
	),
	teamSize: z.number().int().min(1).max(4).optional(),
	/**
	 * sendou.ink user id the created VoD is attributed to. Required for the
	 * Lohi-token (CLI) path since it has no session; the browser path defaults
	 * it to the logged-in user.
	 */
	submitterUserId: id.optional(),
	matches: z.array(ingestVodMatchSchema).min(1).max(50),
});

export type IngestVodMatchInput = z.infer<typeof ingestVodMatchSchema>;
