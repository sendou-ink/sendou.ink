import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { FEED_CATEGORIES } from "./feed-constants";

const FEED_TABS = [
	"FRIENDS",
	...FEED_CATEGORIES.map((category) => category.id),
] as const;

const userId = v.pipe(v.number(), v.integer(), v.minValue(1));

export const feedSearchParams = SearchParams.define({
	/** Feed filter, all posts when `null` */
	tab: SP.param(v.nullable(v.picklist(FEED_TABS)), { loader: false }),
	/** Dev only: whose feed is shown */
	viewAs: SP.param(v.nullable(userId), { loader: true }),
	/** Share link: whose feed the post is from, valid only with `token` */
	sharedBy: SP.param(v.nullable(userId), { loader: true }),
	token: SP.param(v.nullable(v.pipe(v.string(), v.maxLength(64))), {
		loader: true,
	}),
});
