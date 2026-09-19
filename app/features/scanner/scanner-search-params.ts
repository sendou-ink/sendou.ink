import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

/** `home` is the landing; the rest are the views reached from it. */
const SCANNER_VIEWS = [
	"home",
	"live",
	"session",
	"vod",
	"clips",
	"debug",
	"fixtures",
] as const;

export const scannerSearchParams = SearchParams.define({
	view: SP.param(v.picklist(SCANNER_VIEWS), { default: "home", loader: false }),
	/** `view=session`: the session's key — its first detection's wall-clock ms */
	id: SP.param(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))), {
		loader: false,
	}),
	/** `view=vod`: the scanned file's name */
	name: SP.param(v.nullable(v.pipe(v.string(), v.maxLength(300))), {
		loader: false,
	}),
	/** Fixtures view filter: comma-separated substrings, any match keeps a case */
	q: SP.param(v.pipe(v.string(), v.maxLength(200)), {
		default: "",
		loader: false,
	}),
	/** Inspect handoff key: the debug view claims this frame on load */
	inspect: SP.param(v.nullable(v.pipe(v.string(), v.maxLength(100))), {
		loader: false,
	}),
	/** Opt-in scan telemetry: accumulated and shown only when set by hand in the URL (no link points at it) */
	telemetry: SP.param(v.boolean(), { default: false, loader: false }),
	/** Opens the debug tools for anyone (devs and admins have them regardless) */
	debug: SP.param(v.boolean(), { default: false, loader: false }),
});
