import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { SETTINGS_TAB_SLUGS } from "./settings-constants";

export const settingsSearchParams = SearchParams.define({
	tab: SP.param(z.enum(SETTINGS_TAB_SLUGS).nullable(), { loader: false }),
	lng: SP.param(z.string().nullable(), { loader: true }),
});
