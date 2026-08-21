import * as v from "valibot";
import type { Unpacked } from "~/utils/types";

export const streamsSchema = v.object({
	data: v.array(
		v.object({
			id: v.string(),
			user_id: v.string(),
			user_login: v.string(),
			user_name: v.string(),
			game_id: v.string(),
			game_name: v.string(),
			type: v.string(),
			title: v.string(),
			viewer_count: v.number(),
			started_at: v.string(),
			language: v.string(),
			thumbnail_url: v.string(),
			tag_ids: v.array(v.unknown()),
			tags: v.nullish(v.array(v.string())),
			is_mature: v.boolean(),
		}),
	),
	pagination: v.object({ cursor: v.nullish(v.string()) }),
});

export const tokenResponseSchema = v.object({
	access_token: v.string(),
	expires_in: v.number(),
	token_type: v.string(),
});

export const usersSchema = v.object({
	data: v.array(
		v.object({
			id: v.string(),
			login: v.string(),
			display_name: v.string(),
		}),
	),
});

export const videosSchema = v.object({
	data: v.array(
		v.object({
			id: v.string(),
			user_id: v.string(),
			user_login: v.string(),
			title: v.string(),
			created_at: v.string(),
			duration: v.string(),
			view_count: v.number(),
			type: v.string(),
		}),
	),
	pagination: v.object({ cursor: v.nullish(v.string()) }),
});

export type StreamsResponse = v.InferOutput<typeof streamsSchema>;
export type RawStream = Unpacked<v.InferOutput<typeof streamsSchema>["data"]>;
export type UsersResponse = v.InferOutput<typeof usersSchema>;
export type RawVideo = Unpacked<v.InferOutput<typeof videosSchema>["data"]>;
