import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

const MATCH_PAGE_TABS = [
	"rosters",
	"action",
	"result",
	"stats",
	"admin",
] as const;

export const matchPageSearchParams = SearchParams.define({
	tab: SP.param(z.enum(MATCH_PAGE_TABS).nullable(), { loader: false }),
});
