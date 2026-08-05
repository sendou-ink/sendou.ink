/**
 * Header parsing: lobby type ("X Battle"), mode ("Splat Zones") and stage
 * ("Scorch Gorge") from the black tags above the team boxes.
 *
 * The tags auto-size to their text, so the stage's x position depends on the
 * mode's length. Each band is first trimmed to the tag extent (tag columns
 * are near-black background + white text; the map thumbnail around them is
 * mid-brightness), then OCR'd as one line and snapped to the known entries:
 * the mode+stage line is matched against every language's mode × stage
 * combinations (core/localized.ts), and the reported values are always
 * sendou.ink ids regardless of the game's language.
 */
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { ScannerLobby } from "../../../scanner-types";
import { getCV, type Mat } from "../../cv";
import {
	type GlyphSet,
	type RecognizeOptions,
	recognizeText,
} from "../../glyphs";
import { copyRoi } from "../../image";
import { ALL_LOBBY_ENTRIES, MODE_STAGE_COMBOS } from "../../localized";
import { closestBy } from "../../text";
import { HEADER_LINE_BAND, HEADER_LOBBY_BAND } from "./rois";

export interface ParsedHeader {
	lobby: ScannerLobby | null;
	mode: ModeShort | null;
	stage: StageId | null;
	/** min of the closed-set match scores that were attempted */
	confidence: number;
	debug: {
		lobbyReading: string;
		lineReading: string;
		lobbyScore: number;
		lineScore: number;
	};
}

/** Accept a closed-set match only above this score (1 = exact). */
const MIN_MATCH_SCORE = 0.62;

/** A column belongs to a tag when nearly all its pixels are dark bg or bright text. */
const TAG_COLUMN_FRACTION = 0.85;
const TAG_DARK_MAX = 75;
const TAG_BRIGHT_MIN = 165;
/** Stop extending the tag after this many consecutive non-tag columns. */
const TAG_GAP_TOLERANCE = 6;

/**
 * Trim a band crop to the black-tag extent starting from its left edge.
 * Returns the trimmed width (0 when no tag is present at all).
 */
function tagExtent(crop: Mat, darkMax: number): number {
	const { cols, rows, data } = crop;
	let end = 0;
	let gap = 0;
	for (let x = 0; x < cols; x++) {
		let tagLike = 0;
		for (let y = 0; y < rows; y++) {
			const v = data[y * cols + x]!;
			if (v < darkMax || v > TAG_BRIGHT_MIN) tagLike++;
		}
		if (tagLike / rows >= TAG_COLUMN_FRACTION) {
			end = x + 1;
			gap = 0;
		} else if (++gap > TAG_GAP_TOLERANCE) {
			break;
		}
	}
	return end;
}

export interface TagBandOptions extends RecognizeOptions {
	/**
	 * Dark ceiling for the tag-extent trim. Lifted-blacks captures (720p
	 * streams upscaled and re-encoded) raise the tag background above the
	 * default, truncating the trim to a sliver — callers whose closed-set
	 * snap fails retry with a lifted ceiling.
	 */
	tagDarkMax?: number;
}

/**
 * OCR one header band: trim the crop to the black-tag extent, then
 * recognize it as a single line. Shared with the scoreboard-replay header,
 * whose tags have the same style at different positions/sizes.
 */
export function readTagBand(
	gray: Mat,
	band: { x: number; y: number; w: number; h: number },
	glyphs: GlyphSet,
	options: TagBandOptions = {},
): string {
	const crop = copyRoi(gray, band);
	const width = tagExtent(crop, options.tagDarkMax ?? TAG_DARK_MAX);
	if (width < 12) {
		crop.delete();
		return "";
	}
	const cv = getCV();
	const view = crop.roi(new cv.Rect(0, 0, width, crop.rows));
	const trimmed = new cv.Mat();
	view.copyTo(trimmed);
	view.delete();
	crop.delete();
	const result = recognizeText(trimmed, glyphs, {
		spaceGap: 9,
		minCharScore: 0.3,
		...options,
	});
	trimmed.delete();
	return result.text.trim();
}

export function parseHeader(
	gray: Mat,
	lobbyGlyphs: GlyphSet,
	lineGlyphs: GlyphSet,
): ParsedHeader {
	const lobbyReading = readTagBand(gray, HEADER_LOBBY_BAND, lobbyGlyphs);
	const lineReading = readTagBand(gray, HEADER_LINE_BAND, lineGlyphs);

	const lobbyMatch = lobbyReading
		? closestBy(lobbyReading, ALL_LOBBY_ENTRIES, (e) => e.text)
		: null;
	const lineMatch = lineReading
		? closestBy(lineReading, MODE_STAGE_COMBOS, (c) => c.text)
		: null;

	const lobby =
		lobbyMatch && lobbyMatch.score >= MIN_MATCH_SCORE
			? lobbyMatch.entry.lobby
			: null;
	let mode: ModeShort | null = null;
	let stage: StageId | null = null;
	if (lineMatch && lineMatch.score >= MIN_MATCH_SCORE) {
		mode = lineMatch.entry.mode;
		stage = lineMatch.entry.stageId;
	}

	const attempted = [lobbyMatch?.score ?? 0, lineMatch?.score ?? 0];
	return {
		lobby,
		mode,
		stage,
		confidence: Math.min(...attempted),
		debug: {
			lobbyReading,
			lineReading,
			lobbyScore: lobbyMatch?.score ?? 0,
			lineScore: lineMatch?.score ?? 0,
		},
	};
}
