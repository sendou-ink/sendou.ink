import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const VIEW_FILTERS = ["friends", "team", "all"] as const;
export type ViewFilter = (typeof VIEW_FILTERS)[number];

export const friendsSearchParams = SearchParams.define({
	view: SP.param(z.enum(VIEW_FILTERS).nullable(), { loader: false }),
});
