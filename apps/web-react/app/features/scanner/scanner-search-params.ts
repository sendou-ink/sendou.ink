import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const SCANNER_TABS = ["live", "screenshot", "vod"] as const;

export type ScannerTab = (typeof SCANNER_TABS)[number];

export const scannerSearchParams = SearchParams.define({
	tab: SP.param(z.enum(SCANNER_TABS), { default: "live", loader: false }),
	/** Inspect handoff key: the screenshot tab claims this frame on load */
	inspect: SP.param(z.string().max(100).nullable(), { loader: false }),
	/**
	 * Opt-in scan telemetry: counters are accumulated and the panel is shown
	 * only when this is set by hand in the URL (no link points at it)
	 */
	telemetry: SP.param(z.boolean(), { default: false, loader: false }),
});
