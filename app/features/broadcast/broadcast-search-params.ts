import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { BROADCAST_STREAM_ROLES, BROADCAST_VIEWS } from "./broadcast-constants";

export const broadcastOverlaySearchParams = SearchParams.define({
	view: SP.param(v.picklist(BROADCAST_VIEWS), {
		default: "live",
		loader: false,
	}),
	/** Shown in the dashboard instead of OBS, not counted as an OBS source */
	preview: SP.param(v.boolean(), { default: false, loader: false }),
});

export const broadcastStreamSearchParams = SearchParams.define({
	role: SP.param(v.picklist(BROADCAST_STREAM_ROLES), {
		default: "source",
		loader: true,
	}),
});
