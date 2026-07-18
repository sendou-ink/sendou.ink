import { z } from "zod";
import { videoMatchTypes } from "~/features/vods/vods-constants";

const detectionText = z.string().max(500);

/** One detected match of an emberz VoD scan (src/core/vod-matches.ts). */
const ingestVodMatchSchema = z.object({
	/** whole seconds into the video the match starts at */
	startsAt: z.number().int().min(0),
	/** English mode name; null when no source read it */
	mode: detectionText.nullable(),
	/**
	 * true when `mode` is the scanner's fabricated PoC default (Splat Zones)
	 * rather than a real read. Currently informational only — assumed modes
	 * are still stored, since casted footage never exposes the mode.
	 */
	modeAssumed: z.boolean().optional(),
	/** English stage name; null when no source read it */
	stage: detectionText.nullable(),
	/** sendou main-weapon ids; null for a slot that never read */
	weapons: z.array(z.number().int().nullable()).max(16),
});

/**
 * The emberz VoD tab's "Upload to sendou.ink" button packs this, JSONCrushed,
 * into /vods/new's `ingest` search param to prefill the form: the detected
 * match rows, minus the submission fields (YouTube URL, title, date) the user
 * fills in the form. `type` is sent only when the scan auto-detected it
 * (spectator map screens → CAST); absent means the form's default.
 */
export const ingestVodPrefillSchema = z.object({
	type: z.enum(videoMatchTypes).optional(),
	matches: z.array(ingestVodMatchSchema).min(1).max(100),
});

export type IngestVodMatchInput = z.infer<typeof ingestVodMatchSchema>;
