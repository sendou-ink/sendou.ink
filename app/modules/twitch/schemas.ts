import { z } from "zod";
import type { Unpacked } from "~/utils/types";

export const streamsSchema = z.object({
	data: z.array(
		z.object({
			id: z.string(),
			user_id: z.string(),
			user_login: z.string(),
			user_name: z.string(),
			game_id: z.string(),
			game_name: z.string(),
			type: z.string(),
			title: z.string(),
			viewer_count: z.number(),
			started_at: z.string(),
			language: z.string(),
			thumbnail_url: z.string(),
			tag_ids: z.array(z.unknown()),
			tags: z.array(z.string()).nullish(),
			is_mature: z.boolean(),
		}),
	),
	pagination: z.object({ cursor: z.string().nullish() }),
});

export const tokenResponseSchema = z.object({
	access_token: z.string(),
	expires_in: z.number(),
	token_type: z.string(),
});

export type StreamsResponse = z.infer<typeof streamsSchema>;
export type RawStream = Unpacked<z.infer<typeof streamsSchema>["data"]>;
