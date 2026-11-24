import * as R from "remeda";
import { twitchUrl, youtubeThumbnailUrl, youtubeUrl } from "~/utils/urls";
import type { StreamAccount } from "../live-streams-constants";

/** Where the stream can be watched: the live video when its id is known, otherwise the channel. */
export function url(stream: StreamAccount & { videoId?: string | null }) {
	switch (stream.platform) {
		case "TWITCH":
			return twitchUrl(stream.account);
		case "YOUTUBE":
			return stream.videoId
				? `https://www.youtube.com/watch?v=${stream.videoId}`
				: youtubeUrl(stream.account);
	}
}

/** Thumbnail image of a live stream, sized for a stream card. */
export function thumbnailSrc(stream: {
	platform: StreamAccount["platform"];
	thumbnailUrl: string;
	videoId: string | null;
}) {
	switch (stream.platform) {
		case "TWITCH":
			return stream.thumbnailUrl
				.replace("{width}", "640")
				.replace("{height}", "360");
		case "YOUTUBE":
			return stream.videoId
				? youtubeThumbnailUrl(stream.videoId, "hqdefault_live")
				: stream.thumbnailUrl;
	}
}

/** Identifies the account across sources, Twitch logins being case-insensitive. */
export function key({ platform, account }: StreamAccount) {
	return `${platform}:${platform === "TWITCH" ? account.toLowerCase() : account}`;
}

/** Whether both point to the same account on the same platform. */
export function isSameAccount(a: StreamAccount, b: StreamAccount) {
	return key(a) === key(b);
}

/** Live streams of one streamer, most viewed first. */
export interface StreamerStreams<T> {
	streams: [T, ...T[]];
	viewerCount: number;
}

/** Groups the streams of a user live on several platforms together, streams of no user (casts) by their account. Most viewed streamer first. */
export function groupByStreamer<
	T extends StreamAccount & { userId: number | null; viewerCount: number },
>(streams: T[]): StreamerStreams<T>[] {
	const groups = new Map<string, StreamerStreams<T>>();
	for (const stream of R.sortBy(streams, [(s) => s.viewerCount, "desc"])) {
		const streamerKey =
			stream.userId === null ? key(stream) : `user:${stream.userId}`;

		const existing = groups.get(streamerKey);
		if (existing) {
			existing.streams.push(stream);
			existing.viewerCount += stream.viewerCount;
		} else {
			groups.set(streamerKey, {
				streams: [stream],
				viewerCount: stream.viewerCount,
			});
		}
	}

	return R.sortBy([...groups.values()], [(g) => g.viewerCount, "desc"]);
}
