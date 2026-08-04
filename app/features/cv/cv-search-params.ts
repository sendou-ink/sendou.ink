import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const CV_TABS = ["live", "screenshot", "vod"] as const;

export type CvTab = (typeof CV_TABS)[number];

export const cvSearchParams = SearchParams.define({
	tab: SP.param(z.enum(CV_TABS), { default: "live", loader: false }),
});
