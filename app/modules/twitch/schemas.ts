import * as v from "valibot";
import type { Unpacked } from "~/utils/types";

export const streamsSchema = v.object({
	data: v.array(
		v.object({
			user_id: v.string(),
			user_login: v.string(),
			viewer_count: v.number(),
			thumbnail_url: v.string(),
		}),
	),
	pagination: v.object({ cursor: v.nullish(v.string()) }),
});

export const tokenResponseSchema = v.object({
	access_token: v.string(),
});

export const usersSchema = v.object({
	data: v.array(
		v.object({
			id: v.string(),
			login: v.string(),
			broadcaster_type: v.string(),
		}),
	),
});

const videoSchema = v.object({
	id: v.string(),
	created_at: v.string(),
	duration: v.string(),
	view_count: v.number(),
});

export const videosSchema = v.object({
	data: v.array(videoSchema),
	pagination: v.object({ cursor: v.nullish(v.string()) }),
});

export const videosByIdSchema = v.object({
	data: v.array(videoSchema),
});

export type StreamsResponse = v.InferOutput<typeof streamsSchema>;
export type RawStream = Unpacked<v.InferOutput<typeof streamsSchema>["data"]>;
export type UsersResponse = v.InferOutput<typeof usersSchema>;
export type RawVideo = v.InferOutput<typeof videoSchema>;
