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

export const usersSchema = z.object({
	data: z.array(
		z.object({
			id: z.string(),
			login: z.string(),
			display_name: z.string(),
		}),
	),
});

export const videosSchema = z.object({
	data: z.array(
		z.object({
			id: z.string(),
			user_id: z.string(),
			user_login: z.string(),
			title: z.string(),
			created_at: z.string(),
			duration: z.string(),
			view_count: z.number(),
			type: z.string(),
		}),
	),
	pagination: z.object({ cursor: z.string().nullish() }),
});

export type StreamsResponse = z.infer<typeof streamsSchema>;
export type RawStream = Unpacked<z.infer<typeof streamsSchema>["data"]>;
export type UsersResponse = z.infer<typeof usersSchema>;
export type RawVideo = Unpacked<z.infer<typeof videosSchema>["data"]>;
