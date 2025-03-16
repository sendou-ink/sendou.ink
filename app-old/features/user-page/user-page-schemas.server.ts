import { z } from "zod";
import { allSeasons } from "../mmr/season";

export const userParamsSchema = z.object({ identifier: z.string() });

export const seasonsSearchParamsSchema = z.object({
	page: z.coerce.number().optional(),
	info: z.enum(["weapons", "stages", "mates", "enemies"]).optional(),
	season: z.coerce
		.number()
		.optional()
		.refine((nth) => !nth || allSeasons(new Date()).includes(nth)),
});
