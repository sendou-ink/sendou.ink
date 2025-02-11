import { sql } from "~/db/sql";
import type { Video } from "~/db/types";
import {
	dateToDatabaseTimestamp,
	dayMonthYearToDatabaseTimestamp,
} from "~/utils/dates";
import invariant from "~/utils/invariant";
import type { VideoBeingAdded } from "../vods-types";
import {
	extractYoutubeIdFromVideoUrl,
	hoursMinutesSecondsStringToSeconds,
} from "../vods-utils";

const createVideoStm = sql.prepare(/* sql */ `
  insert into "UnvalidatedVideo"
    ("id", "title", "type", "youtubeDate", "eventId", "youtubeId", "submitterUserId", "validatedAt")
  values
    (@id, @title, @type, @youtubeDate, @eventId, @youtubeId, @submitterUserId, @validatedAt)
  returning *
`);

const deleteVideoStm = sql.prepare(/* sql */ `
  delete from "UnvalidatedVideo"
    where "id" = @id
`);

const createVideoMatchStm = sql.prepare(/* sql */ `
  insert into "VideoMatch"
    ("videoId", "startsAt", "stageId", "mode")
  values
    (@videoId, @startsAt, @stageId, @mode)
  returning *
`);

const createVideoMatchPlayerStm = sql.prepare(/* sql */ `
  insert into "VideoMatchPlayer"
    ("videoMatchId", "playerUserId", "playerName", "weaponSplId", "player")
  values
    (@videoMatchId, @playerUserId, @playerName, @weaponSplId, @player)
`);

export const createVod = sql.transaction(
	(
		args: VideoBeingAdded & {
			submitterUserId: number;
			isValidated: boolean;
			id?: number;
		},
	) => {
		const youtubeId = extractYoutubeIdFromVideoUrl(args.youtubeUrl);
		invariant(youtubeId, "Invalid YouTube URL");

		const video = createVideoStm.get({
			id: args.id ?? null,
			title: args.title,
			type: args.type,
			youtubeDate: dayMonthYearToDatabaseTimestamp(args.date),
			eventId: args.eventId ?? null,
			youtubeId,
			submitterUserId: args.submitterUserId,
			validatedAt: args.isValidated
				? dateToDatabaseTimestamp(new Date())
				: null,
		}) as Video;

		for (const match of args.matches) {
			const videoMatch = createVideoMatchStm.get({
				videoId: video.id,
				startsAt: hoursMinutesSecondsStringToSeconds(match.startsAt),
				stageId: match.stageId,
				mode: match.mode,
			}) as any;

			for (const [i, weaponSplId] of match.weapons.entries()) {
				createVideoMatchPlayerStm.run({
					videoMatchId: videoMatch.id,
					playerUserId: args.pov?.type === "USER" ? args.pov.userId : null,
					playerName: args.pov?.type === "NAME" ? args.pov.name : null,
					weaponSplId,
					player: i + 1,
				});
			}
		}

		return video;
	},
);

export const updateVodByReplacing = sql.transaction(
	(
		args: VideoBeingAdded & {
			submitterUserId: number;
			isValidated: boolean;
			id: number;
		},
	) => {
		deleteVideoStm.run({ id: args.id });
		const video = createVod(args);

		return video;
	},
);
