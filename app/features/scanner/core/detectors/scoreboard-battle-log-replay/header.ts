/**
 * Replay-browser header: same tag style as the live header, top line timestamp
 * ("3/7/2026 22:28", "9/11/2026 7:52 PM") + stage, bottom line lobby + mode. The locale-formatted
 * timestamp is validated by shape and kept raw; the rest snaps to closed sets.
 */
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { ScannerLobby } from "../../../scanner-types";
import type { Roi } from "../../canonical";
import type { Mat } from "../../cv";
import type { GlyphSet, RecognizedChar } from "../../glyphs";
import { ALL_STAGE_ENTRIES, LOBBY_MODE_COMBOS } from "../../localized";
import { all, type MatchSteps } from "../../match-steps";
import { closestBy } from "../../text";
import { readTagBandGlyphsSteps, readTagBandSteps } from "../scoreboard/header";
import { HEADER_BOTTOM_BAND, HEADER_TOP_BAND } from "./rois";

export interface ParsedReplayHeader {
	timestamp: string | null;
	stage: StageId | null;
	lobby: ScannerLobby | null;
	mode: ModeShort | null;
	/** min of the closed-set match scores that were attempted */
	confidence: number;
	debug: {
		topReading: string;
		bottomReading: string;
		stageScore: number;
		bottomScore: number;
	};
}

const MIN_MATCH_SCORE = 0.62;

type Meridiem = "AM" | "PM";

/** The clock's AM/PM letter reads as "o" (or a lookalike) whichever it is; the probe decides. */
const MERIDIEM_LETTER_LOOKALIKES = /^[AaPpoO0n]$/;
const CLOCK_DIGIT_LOOKALIKES = /^[0-9OoIl|S]$/;
/** Lowest share of the letter's ink rows probed for legs. */
const MERIDIEM_LEG_ROWS_FRACTION = 0.25;
/** Recognizer's binarization (its default), so the probe sees the ink it segmented. */
const MERIDIEM_INK_MIN = 150;

/**
 * Lifted-blacks captures raise the tag background to ~80-115 gray, above
 * readTagBand's default ceiling, truncating the band to a sliver. A failed snap
 * is re-read with this ceiling and adopted only when it snaps at least as well.
 */
const TAG_DARK_MAX_LIFTED = 120;

/**
 * Locale date ("3/7/2026", "7.3.2026", "2026/3/7") + time, 12h clocks with
 * AM/PM ("9/11/2026 7:52PM"; P can read as "o"), rest = stage. A lone space between skinny time
 * digits is tolerated ("14:1 1") and stripped. Not left-anchored: the battle
 * log's rank icon reads as a junk glyph before the date.
 */
const TIMESTAMP_RE =
	/(\d{1,4}[./-]\d{1,2}[./-]\d{1,4})\s+(\d(?: ?\d)?: ?\d ?\d)(?:\s*([AP0]M))?\s*(.*)$/;

/**
 * The same with lone spaces between skinny date digits too ("9/1 1/2026"),
 * tried after it: a junk glyph before the date could pass as its first digit.
 */
const TIMESTAMP_GAPPED_DATE_RE =
	/(\d(?: ?\d){0,3}[./-]\d(?: ?\d)?[./-]\d(?: ?\d){0,3})\s+(\d(?: ?\d)?: ?\d ?\d)(?:\s*([AP0]M))?\s*(.*)$/;

/**
 * Fused date-time ("22/8/202620:37"), tried after the spaced form. The date's
 * last component is lazy so the time decides the split ("2026/3/720:28" = 7 +
 * 20:28), the hour capped at 23 so a year digit cannot pass as one
 * ("7/10/20260:33" ≠ 202 + 60:33); no spurious-gap tolerance or a lazy match
 * could steal a year digit.
 */
const TIMESTAMP_FUSED_RE =
	/(\d{1,4}[./-]\d{1,2}[./-]\d{1,4}?)((?:[01]?\d|2[0-3]):\d\d)(?:\s*([AP0]M))?\s*(.*)$/;

interface TopBandParse {
	reading: string;
	timestamp: string | null;
	stage: StageId | null;
	stageScore: number;
}

/**
 * BlitzMain digits are near-identical to letter lookalikes (0/O, 1/I/l/|), so a
 * stage read like "R0M-en" burns an edit the snap cannot spare. Stage names are
 * digit-free (sole exception carries a '9'), so both reading and entry fold.
 */
function foldDigitLookalikes(s: string): string {
	return s.replace(/0/g, "o").replace(/[1|I]/g, "l");
}

function parseTopBand(
	reading: string,
	probedMeridiem: Meridiem | null,
): TopBandParse {
	let timestamp: string | null = null;
	let stage: StageId | null = null;
	let stageScore = 0;
	// BlitzMain lookalikes ("I9:04", "O9/OS/2Oo6") fold to digits for the
	// timestamp, and "*" (the colon's runner-up template) to the colon; the stage
	// part keeps its original reading (1:1 replacements, offsets line up)
	const normalized = reading
		.replace(/[Il|]/g, "1")
		.replace(/[Oo]/g, "0")
		.replace(/S/g, "5")
		.replace(/\*/g, ":");
	const m =
		TIMESTAMP_RE.exec(normalized) ??
		TIMESTAMP_GAPPED_DATE_RE.exec(normalized) ??
		TIMESTAMP_FUSED_RE.exec(normalized);
	const stageReading = m
		? reading.slice(reading.length - m[4]!.length)
		: reading;
	if (m) {
		const meridiem = m[3] ? ` ${probedMeridiem ?? m[3].replace("0", "P")}` : "";
		timestamp = `${m[1]!.replace(/ /g, "")} ${m[2]!.replace(/ /g, "")}${meridiem}`;
	}
	if (stageReading) {
		const match = closestBy(
			foldDigitLookalikes(stageReading),
			ALL_STAGE_ENTRIES,
			(e) => foldDigitLookalikes(e.text),
		);
		if (match) {
			stageScore = match.score;
			if (match.score >= MIN_MATCH_SCORE) stage = match.entry.stageId;
		}
	}
	return { reading, timestamp, stage, stageScore };
}

/** The two header tag bands; the battle log passes its own coordinates. */
export interface ReplayHeaderBands {
	top: Roi;
	bottom: Roi;
	/** see TagBandOptions.tagLeadInMax; the battle log tags are not left-anchored */
	tagLeadInMax?: number;
	/** see TagBandOptions.tagColumnFraction; the battle log tags are tilted */
	tagColumnFraction?: number;
}

const REPLAY_BANDS: ReplayHeaderBands = {
	top: HEADER_TOP_BAND,
	bottom: HEADER_BOTTOM_BAND,
};

/** The top and bottom bands read in one lockstep; each band's lifted-ceiling retry follows its own first read. */
export function* parseReplayHeaderSteps(
	gray: Mat,
	topGlyphs: GlyphSet,
	bottomGlyphs: GlyphSet,
	bands: ReplayHeaderBands = REPLAY_BANDS,
	speculative = false,
): MatchSteps<ParsedReplayHeader> {
	const leadIn = {
		tagLeadInMax: bands.tagLeadInMax,
		tagColumnFraction: bands.tagColumnFraction,
	};
	const readTopBand = function* (tagDarkMax?: number) {
		const read = yield* readTagBandGlyphsSteps(
			gray,
			bands.top,
			topGlyphs,
			{ ...leadIn, tagDarkMax },
			speculative,
			probeMeridiem,
		);
		return parseTopBand(read.text, read.inspected);
	};
	const readTop = function* (): MatchSteps<ReturnType<typeof parseTopBand>> {
		let top = yield* readTopBand();
		if (top.stage === null) {
			const retry = yield* readTopBand(TAG_DARK_MAX_LIFTED);
			if (retry.stageScore >= top.stageScore) top = retry;
		}
		return top;
	};
	const readBottom = function* () {
		let bottomReading = yield* readTagBandSteps(
			gray,
			bands.bottom,
			bottomGlyphs,
			leadIn,
			speculative,
		);
		let bottomMatch = bottomReading
			? closestBy(bottomReading, LOBBY_MODE_COMBOS, (c) => c.text)
			: null;
		if (!bottomMatch || bottomMatch.score < MIN_MATCH_SCORE) {
			const reading = yield* readTagBandSteps(
				gray,
				bands.bottom,
				bottomGlyphs,
				{ ...leadIn, tagDarkMax: TAG_DARK_MAX_LIFTED },
				speculative,
			);
			const match = reading
				? closestBy(reading, LOBBY_MODE_COMBOS, (c) => c.text)
				: null;
			if ((match?.score ?? 0) >= (bottomMatch?.score ?? 0)) {
				bottomReading = reading;
				bottomMatch = match;
			}
		}
		return { bottomReading, bottomMatch };
	};
	const [top, { bottomReading, bottomMatch }] = yield* all([
		readTop(),
		readBottom(),
	]);

	let lobby: ScannerLobby | null = null;
	let mode: ModeShort | null = null;
	if (bottomMatch && bottomMatch.score >= MIN_MATCH_SCORE) {
		lobby = bottomMatch.entry.lobby;
		mode = bottomMatch.entry.mode;
	}

	return {
		timestamp: top.timestamp,
		stage: top.stage,
		lobby,
		mode,
		confidence: Math.min(top.stageScore, bottomMatch?.score ?? 0),
		debug: {
			topReading: top.reading,
			bottomReading,
			stageScore: top.stageScore,
			bottomScore: bottomMatch?.score ?? 0,
		},
	};
}

/**
 * A 12h clock's AM/PM, off the letter before the "M" that follows the time:
 * A stands on two legs, P on its stem alone, so the letter's bottom rows
 * carry ink right of its middle only for A. Both letters read as "o".
 */
function probeMeridiem(
	band: Mat,
	chars: readonly RecognizedChar[],
): Meridiem | null {
	const colonAt = chars.findIndex((c) => c.char === ":");
	if (colonAt === -1) return null;
	const mAt = chars.findIndex(
		(c, i) =>
			i > colonAt + 1 &&
			c.char === "M" &&
			MERIDIEM_LETTER_LOOKALIKES.test(chars[i - 1]!.char) &&
			CLOCK_DIGIT_LOOKALIKES.test(chars[i - 2]!.char),
	);
	if (mAt === -1) return null;
	const letter = chars[mAt - 1]!;
	const { cols, data } = band;
	const middle = Math.floor((letter.x0 + letter.x1) / 2);
	const legRows = Math.max(
		1,
		Math.round((letter.y1 - letter.y0) * MERIDIEM_LEG_ROWS_FRACTION),
	);
	let rowsWithRightLeg = 0;
	for (let y = letter.y1 - legRows; y < letter.y1; y++) {
		for (let x = middle + 1; x < letter.x1; x++) {
			if (data[y * cols + x]! >= MERIDIEM_INK_MIN) {
				rowsWithRightLeg++;
				break;
			}
		}
	}
	return rowsWithRightLeg * 2 > legRows ? "AM" : "PM";
}
