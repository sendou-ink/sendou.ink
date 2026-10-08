/**
 * Header parsing: lobby, mode and stage from the black tags above the team
 * boxes. Tags auto-size, so each band is trimmed to the tag extent (near-black
 * bg + white text vs the mid-brightness thumbnail), OCR'd as one line and
 * snapped against every language's mode × stage combos (core/localized.ts).
 * The Latin atlases carry no kana, so a band that doesn't snap is read again
 * with the Japanese ones and the better snap wins. The lobby's parenthetical
 * ("(Series)", "(Open)") is set smaller than the rest of the tag, so it is
 * also read with the lobby glyphs scaled down to its size.
 */
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { ScannerLobby } from "../../../scanner-types";
import { getCV, type Mat } from "../../cv";
import {
	type GlyphSet,
	type RecognizedChar,
	type RecognizeOptions,
	recognizeTextSteps,
	scaleGlyphSet,
} from "../../glyphs";
import { copyRoi } from "../../image";
import { ALL_LOBBY_ENTRIES, MODE_STAGE_COMBOS } from "../../localized";
import { all, done, type MatchSteps } from "../../match-steps";
import { closestBy } from "../../text";
import { HEADER_LINE_BAND, HEADER_LOBBY_BAND } from "./rois";

export interface HeaderGlyphs {
	lobby: GlyphSet;
	line: GlyphSet;
	lobbyJa?: GlyphSet | null;
	lineJa?: GlyphSet | null;
}

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
/** The lobby parenthetical's glyph size relative to the tag's main text. */
const LOBBY_PARENTHETICAL_SCALE = 0.72;
const TAG_RECOGNIZE_OPTIONS: RecognizeOptions = {
	spaceGap: 9,
	minCharScore: 0.3,
};

/**
 * Longest run of tag columns starting within `maxLeadIn` of the left edge (a
 * dark photo edge can fake a short run first); zero-width when no tag.
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
	 * dark ceiling for the extent trim; lifted-blacks captures truncate the trim to a sliver, so
	 * callers retry with a lifted one
	 */
	tagDarkMax?: number;
	/** non-tag columns tolerated before the tag; battle log tags are not left-anchored (a rank icon shifts line 1) */
	tagLeadInMax?: number;
	/** tag-like row fraction a column must reach; battle log tags are tilted so their bands catch photo rows */
	tagColumnFraction?: number;
}

/** OCR one header band: trim to the black-tag extent, recognize as a single line. */
export function* readTagBandSteps(
	gray: Mat,
	band: { x: number; y: number; w: number; h: number },
	glyphs: GlyphSet,
	options: TagBandOptions = {},
	speculative = false,
): MatchSteps<string> {
	const trimmed = trimTagBand(gray, band, options);
	if (!trimmed) return "";
	const result = yield* recognizeTextSteps(
		trimmed,
		glyphs,
		{ ...TAG_RECOGNIZE_OPTIONS, ...options },
		speculative,
	);
	trimmed.delete();
	return result.text.trim();
}

/**
 * The lobby band's candidate readings: the tag read at one size, then for each
 * "(" the downscaled read finds, the main text up to it joined with the
 * downscaled read from it on.
 */
function* readLobbyBandSteps(
	gray: Mat,
	glyphs: GlyphSet,
	speculative: boolean,
): MatchSteps<string[]> {
	const trimmed = trimTagBand(gray, HEADER_LOBBY_BAND, {});
	if (!trimmed) return [];
	const [main, small] = yield* all([
		recognizeTextSteps(trimmed, glyphs, TAG_RECOGNIZE_OPTIONS, speculative),
		recognizeTextSteps(
			trimmed,
			scaleGlyphSet(glyphs, LOBBY_PARENTHETICAL_SCALE),
			TAG_RECOGNIZE_OPTIONS,
			speculative,
		),
	]);
	trimmed.delete();
	const joined = (chars: RecognizedChar[]) => chars.map((c) => c.char).join("");
	const splits = small.chars.flatMap((paren, i) =>
		paren.char === "("
			? [
					`${joined(main.chars.filter((c) => c.x1 <= paren.x0))} ${joined(small.chars.slice(i))}`,
				]
			: [],
	);
	return [main.text.trim(), ...splits];
}

function trimTagBand(
	gray: Mat,
	band: { x: number; y: number; w: number; h: number },
	options: TagBandOptions,
): Mat | null {
	const crop = copyRoi(gray, band);
	const { start, end } = tagExtent(
		crop,
		options.tagDarkMax ?? TAG_DARK_MAX,
		options.tagLeadInMax ?? TAG_GAP_TOLERANCE,
		options.tagColumnFraction ?? TAG_COLUMN_FRACTION,
	);
	if (end - start < 12) {
		crop.delete();
		return null;
	}
	const cv = getCV();
	const view = crop.roi(new cv.Rect(start, 0, end - start, crop.rows));
	const trimmed = new cv.Mat();
	view.copyTo(trimmed);
	view.delete();
	crop.delete();
	return trimmed;
}

export function* parseHeaderSteps(
	gray: Mat,
	glyphs: HeaderGlyphs,
	speculative = false,
): MatchSteps<ParsedHeader> {
	const [latinLobbyReadings, latinLine] = yield* all([
		readLobbyBandSteps(gray, glyphs.lobby, speculative),
		readTagBandSteps(gray, HEADER_LINE_BAND, glyphs.line, {}, speculative),
	]);
	const snapLobby = (reading: string) =>
		reading ? closestBy(reading, ALL_LOBBY_ENTRIES, (e) => e.text) : null;
	const snapLine = (reading: string) =>
		reading ? closestBy(reading, MODE_STAGE_COMBOS, (c) => c.text) : null;
	let latinLobby = "";
	let latinLobbyMatch: ReturnType<typeof snapLobby> = null;
	for (const reading of latinLobbyReadings) {
		const match = snapLobby(reading);
		if ((match?.score ?? 0) > (latinLobbyMatch?.score ?? 0)) {
			latinLobby = reading;
			latinLobbyMatch = match;
		}
	}
	const latinLineMatch = snapLine(latinLine);

	const unsnapped = (match: { score: number } | null) =>
		(match?.score ?? 0) < MIN_MATCH_SCORE;
	const [jaLobby, jaLine] = yield* all([
		glyphs.lobbyJa && unsnapped(latinLobbyMatch)
			? readTagBandSteps(
					gray,
					HEADER_LOBBY_BAND,
					glyphs.lobbyJa,
					{},
					speculative,
				)
			: done(""),
		glyphs.lineJa && unsnapped(latinLineMatch)
			? readTagBandSteps(gray, HEADER_LINE_BAND, glyphs.lineJa, {}, speculative)
			: done(""),
	]);
	const jaLobbyMatch = snapLobby(jaLobby);
	const jaLineMatch = snapLine(jaLine);
	const jaLobbyWins =
		(jaLobbyMatch?.score ?? 0) > (latinLobbyMatch?.score ?? 0);
	const jaLineWins = (jaLineMatch?.score ?? 0) > (latinLineMatch?.score ?? 0);
	const lobbyReading = jaLobbyWins ? jaLobby : latinLobby;
	const lineReading = jaLineWins ? jaLine : latinLine;
	const lobbyMatch = jaLobbyWins ? jaLobbyMatch : latinLobbyMatch;
	const lineMatch = jaLineWins ? jaLineMatch : latinLineMatch;

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
