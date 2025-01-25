import { add } from "date-fns";
import { z } from "zod";
import {
	dayMonthYear,
	id,
	modeShort,
	safeJSONParse,
	stageId,
	weaponSplId,
} from "~/utils/zod";
import { dayMonthYearToDate } from "../../utils/dates";
import { VOD, videoMatchTypes } from "./vods-constants";
import { extractYoutubeIdFromVideoUrl } from "./vods-utils";

export const videoMatchSchema = z.object({
	startsAt: z.string().regex(/^(\d{1,2}:)?\d{1,2}:\d{2}$/, {
		message: "Invalid time format. Use HH:MM:SS or MM:SS",
	}),
	stageId: stageId,
	mode: modeShort,
	weapons: z.array(weaponSplId),
});

export const videoSchema = z
	.object({
		type: z.enum(videoMatchTypes),
		eventId: z.number().optional(),
		youtubeUrl: z.string().refine(
			(val) => {
				const id = extractYoutubeIdFromVideoUrl(val);

				return id !== null;
			},
			{
				message: "Invalid YouTube URL",
			},
		),
		title: z.string().min(VOD.TITLE_MIN_LENGTH).max(VOD.TITLE_MAX_LENGTH),
		date: dayMonthYear.refine(
			(data) => {
				const date = dayMonthYearToDate(data);

				return date < add(new Date(), { days: 1 });
			},
			{
				message: "Date must not be in the future",
			},
		),
		pov: z
			.union([
				z.object({
					type: z.literal("USER"),
					userId: id,
				}),
				z.object({
					type: z.literal("NAME"),
					name: z
						.string()
						.min(VOD.PLAYER_NAME_MIN_LENGTH)
						.max(VOD.PLAYER_NAME_MAX_LENGTH),
				}),
			])
			.optional(),
		matches: z.array(videoMatchSchema),
	})
	.refine((data) => {
		if (
			data.type === "CAST" &&
			data.matches.some((match) => match.weapons.length !== 8)
		) {
			return [false, { message: "CAST matches must have 8 weapons" }];
		}

		if (
			data.type !== "CAST" &&
			data.matches.some((match) => match.weapons.length !== 1)
		) {
			return [false, { message: "Non-CAST matches must have 1 weapon" }];
		}

		// xxx: if not cast, must have pov

		return true;
	});

export const videoInputSchema = z.object({
	video: z.preprocess(safeJSONParse, videoSchema),
	vodToEditId: id.optional(),
});
