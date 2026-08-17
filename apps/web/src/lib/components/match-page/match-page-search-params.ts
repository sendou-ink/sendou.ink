import * as v from "valibot";
import * as SearchParams from "#lib/modules/search-params/search-params.ts";
import { SP } from "#lib/modules/search-params/search-params.ts";
import { MATCH_PAGE_TABS } from "./match-page-constants.ts";

export const matchPageSearchParams = SearchParams.define({
	tab: SP.param(v.nullable(v.picklist(MATCH_PAGE_TABS)), {}),
});
