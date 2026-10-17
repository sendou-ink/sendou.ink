import * as Quota from "./quota";
import { getYoutubeApiKey } from "./utils.server";

const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3";

export class YoutubeApiError extends Error {
	readonly status: number;

	constructor(status: number) {
		super(`YouTube API request failed with status: ${status}`);
		this.name = "YoutubeApiError";
		this.status = status;
	}
}

export async function youtubeFetch(
	endpoint: Quota.YoutubeEndpoint,
	searchParams: Record<string, string>,
): Promise<unknown> {
	const url = new URL(`${YOUTUBE_API_URL}/${endpoint}`);
	for (const [key, value] of Object.entries(searchParams)) {
		url.searchParams.set(key, value);
	}
	url.searchParams.set("key", getYoutubeApiKey());

	Quota.spend(endpoint);

	const res = await fetch(url);
	if (!res.ok) {
		throw new YoutubeApiError(res.status);
	}

	return res.json();
}
