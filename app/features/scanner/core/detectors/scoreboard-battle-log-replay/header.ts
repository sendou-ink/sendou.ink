/**
 * Replay-browser header: same tag style as the live header, top line timestamp
 * ("3/7/2026 22:28") + stage, bottom line lobby + mode. The locale-formatted
 * timestamp is validated by shape and kept raw; the rest snaps to closed sets.
 */
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { ScannerLobby } from "../../../scanner-types";
import type { Roi } from "../../canonical";
import type { Mat } from "../../cv";
import type { GlyphSet } from "../../glyphs";
import { ALL_STAGE_ENTRIES, LOBBY_MODE_COMBOS } from "../../localized";
import { all, type MatchSteps } from "../../match-steps";
import { closestBy } from "../../text";
import { readTagBandSteps } from "../scoreboard/header";
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

/**
 * Lifted-blacks captures raise the tag background to ~80-115 gray, above
 * readTagBand's default ceiling, truncating the band to a sliver. A failed snap
 * is re-read with this ceiling and adopted only when it snaps at least as well.
 */
const TAG_DARK_MAX_LIFTED = 120;

/**
 * Locale date ("3/7/2026", "7.3.2026", "2026/3/7") + time, rest = stage. A lone
 * space between skinny time digits is tolerated ("14:1 1") and stripped. Not
 * left-anchored: the battle log's rank icon reads as a junk glyph before the date.
 */
const TIMESTAMP_RE =
	/(\d{1,4}[./-]\d{1,2}[./-]\d{1,4})\s+(\d(?: ?\d)?: ?\d ?\d)\s*(.*)$/;

/**
 * Fused date-time ("22/8/202620:37"), tried after the spaced form. The date's
 * last component is lazy so the time decides the split ("2026/3/720:28" = 7 +
 * 20:28); no spurious-gap tolerance or a lazy match could steal a year digit.
 */
const TIMESTAMP_FUSED_RE =
	/(\d{1,4}[./-]\d{1,2}[./-]\d{1,4}?)(\d{1,2}:\d\d)\s*(.*)$/;

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

function parseTopBand(reading: string): TopBandParse {
	let timestamp: string | null = null;
	let stage: StageId | null = null;
	let stageScore = 0;
	// BlitzMain lookalikes ("I9:04", "O9/OS/2Oo6") fold to digits for the
	// timestamp; the stage part keeps its original reading (1:1 replacements, offsets line up)
	const normalized = reading
		.replace(/[Il|]/g, "1")
		.replace(/[Oo]/g, "0")
		.replace(/S/g, "5");
	const m =
		TIMESTAMP_RE.exec(normalized) ?? TIMESTAMP_FUSED_RE.exec(normalized);
	const stageReading = m
		? reading.slice(reading.length - m[3]!.length)
		: reading;
	if (m) timestamp = `${m[1]!} ${m[2]!.replace(/ /g, "")}`;
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
	const readTop = function* (): MatchSteps<ReturnType<typeof parseTopBand>> {
		let top = parseTopBand(
			yield* readTagBandSteps(gray, bands.top, topGlyphs, leadIn, speculative),
		);
		if (top.stage === null) {
			const retry = parseTopBand(
				yield* readTagBandSteps(
					gray,
					bands.top,
					topGlyphs,
					{ ...leadIn, tagDarkMax: TAG_DARK_MAX_LIFTED },
					speculative,
				),
			);
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
