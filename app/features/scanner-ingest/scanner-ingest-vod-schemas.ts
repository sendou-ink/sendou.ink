import * as v from "valibot";
import {
	mainWeaponIdSchema,
	modeShortSchema,
	stageIdSchema,
} from "~/features/scanner/scanner-schemas";
import { videoMatchTypes } from "~/features/vods/vods-constants";

/** One detected match of a scanner VoD scan, projected from a ScannerMatch (~/features/scanner/components/sendou-upload.ts). */
const ingestVodMatchSchema = v.object({
	/** whole seconds into the video the match starts at */
	startsAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
	/** null when no source read it */
	mode: v.nullable(modeShortSchema),
	/**
	 * true when `mode` is the scanner's fabricated PoC default (SZ) rather
	 * than a real read. Currently informational only — assumed modes are
	 * still stored, since casted footage never exposes the mode.
	 */
	modeAssumed: v.optional(v.boolean()),
	/** null when no source read it */
	stage: v.nullable(stageIdSchema),
	/** sendou main-weapon ids; null for a slot that never read */
	weapons: v.pipe(v.array(v.nullable(mainWeaponIdSchema)), v.maxLength(16)),
	/**
	 * the POV player's weapon, prefilling a non-CAST VoD's single weapon
	 * select. Absent when no scoreboard identified the POV seat (or it read
	 * no weapon) — including on casted footage, which has no POV.
	 */
	povWeapon: v.optional(mainWeaponIdSchema),
});

/**
 * The scanner VoD tab's "Add VoD" button packs this into /vods/new's
 * `ingest` search param (an `SP.json` param, compressed by the search-params
 * module) to prefill the form: the detected match rows, minus the submission
 * fields (YouTube URL, title, date) the user fills in the form. `type` is
 * sent only when the scan auto-detected it (spectator map screens → CAST);
 * absent means the form's default.
 */
export const ingestVodPrefillSchema = v.object({
	type: v.optional(v.picklist(videoMatchTypes)),
	matches: v.pipe(
		v.array(ingestVodMatchSchema),
		v.minLength(1),
		v.maxLength(100),
	),
});

export type IngestVodMatchInput = v.InferOutput<typeof ingestVodMatchSchema>;
export type IngestVodPrefill = v.InferOutput<typeof ingestVodPrefillSchema>;
