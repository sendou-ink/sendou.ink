import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { BROADCAST_STREAM_ROLES, BROADCAST_VIEWS } from "./broadcast-constants";

/** A tournament broadcast's overlay, as the dashboard's previews show it. */
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

/** A user's OBS URL and its stream, see `findProgram`. */
export const broadcastProgramSearchParams = SearchParams.define({
	/** Secret identifying the URL, OBS has no session. */
	key: SP.param(v.nullable(v.pipe(v.string(), v.maxLength(100))), {
		loader: true,
	}),
});
