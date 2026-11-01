// xxx: urls.ts?

import type { FeedItemType } from "./feed-constants";

export const FEED_TEST_PAGE = "/feed-test";

export const feedItemPage = (type: FeedItemType) => `/feed/${type}`;
