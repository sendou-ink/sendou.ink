import { add } from "date-fns";
import { z } from "zod";
import {
	dayMonthYear,
	id,
	modeShort,
	nonEmptyString,
	safeJSONParse,
	stageId,
	weaponSplId,
} from "~/utils/zod";
import { dayMonthYearToDate } from "../../utils/dates";
import { videoMatchTypes } from "./vods-constants";
import { extractYoutubeIdFromVideoUrl } from "./vods-utils";

export const HOURS_MINUTES_SECONDS_REGEX = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;

export const videoMatchSchema = z.object({
	startsAt: z.string().regex(HOURS_MINUTES_SECONDS_REGEX, {
		message: "Invalid time format. Use HH:MM:SS or MM:SS",
	}),
	stageId: stageId,
	mode: modeShort,
	weapons: z.array(weaponSplId),
});

export const videoSchema = z.preprocess(
	(val: any) => (val.type === "CAST" ? { ...val, pov: undefined } : val),
	z
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
			title: nonEmptyString.max(100),
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
						name: nonEmptyString.max(100),
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
				return false;
			}

			if (
				data.type !== "CAST" &&
				data.matches.some((match) => match.weapons.length !== 1)
			) {
				return false;
			}

			return true;
		}),
);

export const videoInputSchema = z.object({
	video: z.preprocess(safeJSONParse, videoSchema),
	vodToEditId: id.optional(),
});
