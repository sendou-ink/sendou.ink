import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const SCANNER_TABS = ["live", "screenshot", "vod"] as const;

export type ScannerTab = (typeof SCANNER_TABS)[number];

export const scannerSearchParams = SearchParams.define({
	tab: SP.param(z.enum(SCANNER_TABS), { default: "live", loader: false }),
});
