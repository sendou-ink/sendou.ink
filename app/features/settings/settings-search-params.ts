import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { SETTINGS_TAB_SLUGS } from "./settings-constants";

export const settingsSearchParams = SearchParams.define({
	tab: SP.param(v.nullable(v.picklist(SETTINGS_TAB_SLUGS)), { loader: false }),
	lng: SP.param(v.nullable(v.string()), { loader: true }),
});
