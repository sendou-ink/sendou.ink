import { z } from "zod";
import type { Unpacked } from "~/utils/types";

export const youtubeSearchResponseSchema = z.object({
	items: z.array(
		z.object({
			id: z.object({
				videoId: z.string(),
			}),
			snippet: z.object({
				channelId: z.string(),
				title: z.string(),
				thumbnails: z
					.object({
						default: z.object({ url: z.string() }).optional(),
						medium: z.object({ url: z.string() }).optional(),
						high: z.object({ url: z.string() }).optional(),
						standard: z.object({ url: z.string() }).optional(),
						maxres: z.object({ url: z.string() }).optional(),
					})
					.optional(),
			}),
		}),
	),
});

export const youtubeVideosResponseSchema = z.object({
	items: z.array(
		z.object({
			id: z.string(),
			snippet: z.object({
				channelId: z.string(),
				title: z.string(),
				thumbnails: z
					.object({
						default: z.object({ url: z.string() }).optional(),
						medium: z.object({ url: z.string() }).optional(),
						high: z.object({ url: z.string() }).optional(),
						standard: z.object({ url: z.string() }).optional(),
						maxres: z.object({ url: z.string() }).optional(),
					})
					.optional(),
			}),
			liveStreamingDetails: z
				.object({
					concurrentViewers: z.string().optional(),
				})
				.optional(),
		}),
	),
});

export type YouTubeSearchItem = Unpacked<
	z.infer<typeof youtubeSearchResponseSchema>["items"]
>;
export type YouTubeVideoItem = Unpacked<
	z.infer<typeof youtubeVideosResponseSchema>["items"]
>;
