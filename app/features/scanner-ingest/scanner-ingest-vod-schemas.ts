import { z } from "zod";
import {
	mainWeaponIdSchema,
	modeShortSchema,
	stageIdSchema,
} from "~/features/scanner/scanner-schemas";
import { videoMatchTypes } from "~/features/vods/vods-constants";

/** One detected match of a scanner VoD scan, projected from a ScannerMatch (~/features/scanner/components/sendou-upload.ts). */
const ingestVodMatchSchema = z.object({
	/** whole seconds into the video the match starts at */
	startsAt: z.number().int().min(0),
	/** null when no source read it */
	mode: modeShortSchema.nullable(),
	/**
	 * true when `mode` is the scanner's fabricated PoC default (SZ) rather
	 * than a real read. Currently informational only — assumed modes are
	 * still stored, since casted footage never exposes the mode.
	 */
	modeAssumed: z.boolean().optional(),
	/** null when no source read it */
	stage: stageIdSchema.nullable(),
	/** sendou main-weapon ids; null for a slot that never read */
	weapons: z.array(mainWeaponIdSchema.nullable()).max(16),
});

/**
 * The scanner VoD tab's "Upload as VoD" button packs this into /vods/new's
 * `ingest` search param (an `SP.json` param, compressed by the search-params
 * module) to prefill the form: the detected match rows, minus the submission
 * fields (YouTube URL, title, date) the user fills in the form. `type` is
 * sent only when the scan auto-detected it (spectator map screens → CAST);
 * absent means the form's default.
 */
export const ingestVodPrefillSchema = z.object({
	type: z.enum(videoMatchTypes).optional(),
	matches: z.array(ingestVodMatchSchema).min(1).max(100),
});

export type IngestVodMatchInput = z.infer<typeof ingestVodMatchSchema>;
export type IngestVodPrefill = z.infer<typeof ingestVodPrefillSchema>;
