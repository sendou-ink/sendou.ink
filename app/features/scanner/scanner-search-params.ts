import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const SCANNER_TABS = ["live", "screenshot", "vod", "fixtures"] as const;

export type ScannerTab = (typeof SCANNER_TABS)[number];

export const scannerSearchParams = SearchParams.define({
	tab: SP.param(v.picklist(SCANNER_TABS), { default: "live", loader: false }),
	/** Fixtures tab filter: comma-separated substrings, any match keeps a case */
	q: SP.param(v.pipe(v.string(), v.maxLength(200)), {
		default: "",
		loader: false,
	}),
	/** Inspect handoff key: the screenshot tab claims this frame on load */
	inspect: SP.param(v.nullable(v.pipe(v.string(), v.maxLength(100))), {
		loader: false,
	}),
	/** Opt-in scan telemetry: accumulated and shown only when set by hand in the URL (no link points at it) */
	telemetry: SP.param(v.boolean(), { default: false, loader: false }),
});
