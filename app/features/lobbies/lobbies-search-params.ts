import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { LOBBY_INDEX_TABS } from "./lobbies-constants";

export const lobbiesSearchParams = SearchParams.define({
	/** null = the tab with the viewer's own lobby, or else the first non-empty one */
	tab: SP.param(v.nullable(v.picklist(LOBBY_INDEX_TABS)), { loader: false }),
});
