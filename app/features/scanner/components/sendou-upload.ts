/**
 * "Upload to sendou.ink" link for a fully processed VoD: the detected events
 * are grouped into per-match rows (src/core/vod-matches.ts) and packed into
 * the `ingest` search param of sendou.ink's /vods/new form (an `SP.json`
 * param the search-params module compresses), which prefills a new VoD from
 * them (the user adds the YouTube URL/title/date and fixes any misreads
 * before submitting).
 *
 * The VoD type is auto-detected: footage containing the casted 8-player
 * spectator map screen is a CAST VoD; anything else leaves the form's default
 * type untouched.
 */
import type { IngestVodPrefill } from "~/features/scanner-ingest/scanner-ingest-vod-schemas";
import { vodsNewSearchParams } from "~/features/vods/vods-search-params";
import { newVodPage } from "~/utils/urls";
import {
	MINIMAP_EVENT_TYPE,
	type MinimapData,
} from "../core/detectors/minimap/index";
import type { DetectedEvent } from "../core/detectors/types";
import { buildVodMatches } from "../core/vod-matches";

/**
 * GET query params ride the request line, and servers/proxies commonly cap
 * that around 8-16 KB. A VoD long enough to blow past this needs a POST
 * flow, which /vods/new doesn't offer yet — surface that instead of
 * emitting a URL the server would reject with an opaque error.
 */
const MAX_URL_LENGTH = 8000;

export interface SendouUpload {
	/** prefilled /vods/new path (same-origin); null when nothing usable to send */
	url: string | null;
	/** set when matches exist but no usable URL could be built */
	problem: string | null;
}

/** Builds the prefilled /vods/new link for a completed scan's events. */
export function sendouUpload(events: readonly DetectedEvent[]): SendouUpload {
	const matches = buildVodMatches(events);
	if (matches.length === 0) return { url: null, problem: null };

	const isCast = events.some(
		(event) =>
			event.type === MINIMAP_EVENT_TYPE &&
			(event.data as MinimapData).spectator,
	);

	const payload: IngestVodPrefill = isCast
		? { type: "CAST", matches }
		: { matches };
	const result = vodsNewSearchParams.href(newVodPage(), { ingest: payload });
	if (result.length > MAX_URL_LENGTH) {
		return {
			url: null,
			problem:
				`prefill URL is ${result.length} chars (limit ~${MAX_URL_LENGTH}) — ` +
				"too many matches for a GET query param.",
		};
	}
	return { url: result, problem: null };
}
