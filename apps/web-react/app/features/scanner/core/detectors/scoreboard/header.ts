/**
 * Header parsing: lobby type ("X Battle"), mode ("Splat Zones") and stage
 * ("Scorch Gorge") from the black tags above the team boxes.
 *
 * Tags auto-size to their text, so the stage's x position depends on mode
 * length. Each band is trimmed to the tag extent (near-black bg + white
 * text; the map thumbnail around it is mid-brightness), then OCR'd as one
 * line and snapped against every language's mode × stage combos
 * (core/localized.ts) — reported values are always sendou.ink ids.
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
 * Trim a band crop to the black-tag extent: the longest run of tag columns
 * starting within `maxLeadIn` of the left edge (a dark photo edge can fake
 * a short run before the real tag), each run extended right until the tag
 * ends. Returns a zero-width range when no tag is present at all.
 */
function tagExtent(
	crop: Mat,
	darkMax: number,
	maxLeadIn: number,
	columnFraction: number,
): { start: number; end: number } {
	const { cols, rows, data } = crop;
	let best = { start: 0, end: 0 };
	let start = -1;
	let end = 0;
	let gap = 0;
	const takeRun = () => {
		if (start !== -1 && end - start > best.end - best.start) {
			best = { start, end };
		}
		start = -1;
		gap = 0;
	};
	for (let x = 0; x < cols; x++) {
		let tagLike = 0;
		for (let y = 0; y < rows; y++) {
			const v = data[y * cols + x]!;
			if (v < darkMax || v > TAG_BRIGHT_MIN) tagLike++;
		}
		if (tagLike / rows >= columnFraction) {
			if (start === -1) {
				if (x > maxLeadIn) break;
				start = x;
			}
			end = x + 1;
			gap = 0;
		} else if (start !== -1 && ++gap > TAG_GAP_TOLERANCE) {
			takeRun();
		} else if (start === -1 && x > maxLeadIn) {
			break;
		}
	}
	takeRun();
	return best;
}

export interface TagBandOptions extends RecognizeOptions {
	/**
	 * Dark ceiling for the tag-extent trim. Lifted-blacks captures (720p
	 * streams upscaled and re-encoded) raise the tag background above the
	 * default, truncating the trim to a sliver — callers whose closed-set
	 * snap fails retry with a lifted ceiling.
	 */
	tagDarkMax?: number;
	/**
	 * Non-tag columns tolerated before the tag begins. The battle log tags
	 * are not left-anchored (a leading rank icon shifts line 1 per lobby
	 * type), so its bands start on the stage photo and scan for the tag.
	 */
	tagLeadInMax?: number;
	/**
	 * Tag-like row fraction a column must reach. The battle log tags are
	 * subtly tilted, so a horizontal band always catches a few photo rows
	 * above or below the box — those bands pass a looser fraction.
	 */
	tagColumnFraction?: number;
}

/**
 * OCR one header band: trim the crop to the black-tag extent, then
 * recognize it as a single line. Shared with the scoreboard-battle-log-replay
 * header, whose tags have the same style at different positions/sizes.
 */
export function readTagBand(
	gray: Mat,
	band: { x: number; y: number; w: number; h: number },
	glyphs: GlyphSet,
	options: TagBandOptions = {},
): string {
	const crop = copyRoi(gray, band);
	const { start, end } = tagExtent(
		crop,
		options.tagDarkMax ?? TAG_DARK_MAX,
		options.tagLeadInMax ?? TAG_GAP_TOLERANCE,
		options.tagColumnFraction ?? TAG_COLUMN_FRACTION,
	);
	if (end - start < 12) {
		crop.delete();
		return "";
	}
	const cv = getCV();
	const view = crop.roi(new cv.Rect(start, 0, end - start, crop.rows));
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
