import { feedSearchParams } from "./feed-search-params";

/** Navigation state of a post page opened from the feed, its back link then goes back in history to keep the feed's scroll position */
export interface FeedItemPageState {
	fromFeed: true;
}

export const feedItemPage = (
	id: string,
	params: {
		viewAs?: number | null;
		sharedBy?: number | null;
		token?: string | null;
	} = {},
) => feedSearchParams.href(`/feed/${id}`, params);
