import { cachified } from "@epic-web/cachified";
import * as R from "remeda";
import { cache, ttl } from "~/utils/cache.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import { logger } from "~/utils/logger";
import { assertUnreachable } from "~/utils/types";
import {
	type YouTubeSearchItem,
	type YouTubeVideoItem,
	youtubeSearchResponseSchema,
	youtubeVideosResponseSchema,
} from "./schemas";
import { getYouTubeEnvVars, hasYouTubeEnvVars, youtubeVideoUrl } from "./utils";

const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

export async function getLiveStreamsByChannelIds(channelIds: string[]) {
	const distinctChannelIds = R.pipe(
		channelIds,
		R.unique(),
		R.sortBy(R.identity()),
	);

	if (distinctChannelIds.length === 0) return [];
	if (!hasYouTubeEnvVars()) return [];
	if (process.env.NODE_ENV === "test" || IS_E2E_TEST_RUN) return [];

	try {
		return await cachified({
			key: `youtube-streams:${distinctChannelIds.join(",")}`,
			cache,
			ttl: ttl(1000 * 60 * 2),
			staleWhileRevalidate: ttl(1000 * 60 * 10),
			async getFreshValue() {
				return getFreshStreams(distinctChannelIds);
			},
		});
	} catch (error) {
		logger.error(error);
		return [];
	}
}

async function getFreshStreams(channelIds: string[]) {
	const liveSearchResults = await Promise.all(
		channelIds.map(async (channelId) => {
			const item = await getLiveVideoByChannelId(channelId);
			return item ? { channelId, item } : null;
		}),
	);

	const liveVideos = liveSearchResults.filter(R.isTruthy);
	if (liveVideos.length === 0) return [];

	const videoDetails = await getVideoDetails(
		liveVideos.map(({ item }) => item.id.videoId),
	);

	return liveVideos
		.map(({ channelId, item }) => {
			const details = videoDetails.find(
				(video) => video.id === item.id.videoId,
			);
			return mapLiveStream({ channelId, searchItem: item, videoItem: details });
		})
		.filter(R.isTruthy)
		.sort((a, b) => b.viewerCount - a.viewerCount);
}

function mapLiveStream({
	channelId,
	searchItem,
	videoItem,
}: {
	channelId: string;
	searchItem: YouTubeSearchItem;
	videoItem: YouTubeVideoItem | undefined;
}) {
	const thumbnailUrl = pickThumbnailUrl(videoItem?.snippet.thumbnails);
	if (!thumbnailUrl) return null;

	return {
		thumbnailUrl,
		viewerCount: Number(
			videoItem?.liveStreamingDetails?.concurrentViewers ?? 0,
		),
		youtubeChannelId: channelId,
		youtubeVideoId: searchItem.id.videoId,
		title: videoItem?.snippet.title ?? searchItem.snippet.title,
		url: youtubeVideoUrl(searchItem.id.videoId),
	};
}

async function getLiveVideoByChannelId(channelId: string) {
	const { YOUTUBE_API_KEY } = getYouTubeEnvVars();
	const url = new URL(YOUTUBE_SEARCH_URL);

	url.searchParams.set("part", "snippet");
	url.searchParams.set("channelId", channelId);
	url.searchParams.set("eventType", "live");
	url.searchParams.set("type", "video");
	url.searchParams.set("maxResults", "1");
	url.searchParams.set("key", YOUTUBE_API_KEY);

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`Getting YouTube live video failed with status code: ${response.status}`,
		);
	}

	const parsed = youtubeSearchResponseSchema.safeParse(await response.json());
	if (!parsed.success) {
		throw new Error(parsed.error.message);
	}

	return parsed.data.items[0] ?? null;
}

async function getVideoDetails(videoIds: string[]) {
	if (videoIds.length === 0) return [];

	const { YOUTUBE_API_KEY } = getYouTubeEnvVars();
	const url = new URL(YOUTUBE_VIDEOS_URL);

	url.searchParams.set("part", "snippet,liveStreamingDetails");
	url.searchParams.set("id", videoIds.join(","));
	url.searchParams.set("key", YOUTUBE_API_KEY);

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`Getting YouTube video details failed with status code: ${response.status}`,
		);
	}

	const parsed = youtubeVideosResponseSchema.safeParse(await response.json());
	if (!parsed.success) {
		throw new Error(parsed.error.message);
	}

	return parsed.data.items;
}

function pickThumbnailUrl(
	thumbnails:
		| YouTubeSearchItem["snippet"]["thumbnails"]
		| YouTubeVideoItem["snippet"]["thumbnails"]
		| undefined,
) {
	if (!thumbnails) return null;

	for (const size of [
		"maxres",
		"standard",
		"high",
		"medium",
		"default",
	] as const) {
		switch (size) {
			case "maxres":
			case "standard":
			case "high":
			case "medium":
			case "default": {
				const thumbnail = thumbnails[size];
				if (thumbnail?.url) return thumbnail.url;
				break;
			}
			default:
				assertUnreachable(size);
		}
	}

	return null;
}
