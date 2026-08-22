/**
 * Replay-browser header parsing. Same black auto-sized tag style as the
 * live scoreboard header, but different content: the top line holds the
 * recording timestamp ("3/7/2026 22:28") followed by the stage, the bottom
 * line the lobby (bold) followed by the mode.
 *
 * The timestamp is locale-formatted and open-ended, so it is validated by
 * shape and kept as a raw string; stage and lobby+mode snap to the closed
 * sets shared with the live header.
 */
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { ScannerLobby } from "../../../scanner-types";
import type { Roi } from "../../canonical";
import type { Mat } from "../../cv";
import type { GlyphSet } from "../../glyphs";
import { ALL_STAGE_ENTRIES, LOBBY_MODE_COMBOS } from "../../localized";
import { closestBy } from "../../text";
import { readTagBand } from "../scoreboard/header";
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
 * Lifted-blacks captures (720p streams upscaled and re-encoded) raise the
 * tag background to ~80-115 gray, above readTagBand's default dark ceiling,
 * so the tag-extent trim truncates the band to a sliver and the read comes
 * back empty. A band whose closed-set snap fails is re-read with this
 * ceiling; the retry is adopted only when it snaps at least as well.
 */
const TAG_DARK_MAX_LIFTED = 120;

/**
 * "3/7/2026 22:28" and friends; capture the rest of the line (the stage).
 * The console formats the date per locale — "7.3.2026" (de), "2026/3/7"
 * (ja) — so any . / - separated triple followed by a time is accepted.
 * Adjacent skinny time digits can read with a spurious gap on compressed
 * captures ("14:1 1"), so a lone space is tolerated between them and
 * stripped when the timestamp is assembled. Not left-anchored: the
 * battle log line leads with a rank icon on ranked lobbies, which reads as
 * a junk glyph before the date.
 */
const TIMESTAMP_RE =
	/(\d{1,4}[./-]\d{1,2}[./-]\d{1,4})\s+(\d(?: ?\d)?: ?\d ?\d)\s*(.*)$/;

/**
 * The date-to-time gap can also collapse entirely ("22/8/202620:37"), tried
 * only after the spaced form fails. The date's last component is lazy so the
 * time match decides where the fused run splits ("2026/3/720:28" is 7 +
 * 20:28, not 7202 + 0:28), and the time drops the spurious-gap tolerance —
 * with it, a lazy match could steal the year's last digit instead.
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
 * In the BlitzMain glyphs the digit forms are near-identical to their letter
 * lookalikes (0/O, the 1/I/l/| bars), so a stage read can surface the digit
 * ("R0M-en") or the wrong bar ("WnrId") and burn an edit the snap threshold
 * cannot spare. Stage names are digit-free in every language (sole exception
 * carries a '9'), so digits and bars fold to letters before snapping — on
 * both the reading and the entry, so an entry's own 'I' ("Inkblot") lands in
 * the same folded space.
 */
function foldDigitLookalikes(s: string): string {
	return s.replace(/0/g, "o").replace(/[1|I]/g, "l");
}

function parseTopBand(reading: string): TopBandParse {
	let timestamp: string | null = null;
	let stage: StageId | null = null;
	let stageScore = 0;
	// The top band reads with the BlitzMain name glyphs, where 1/I/l/| are
	// identical bars ("I9:04"), O/o ride a hair off 0, and 8 can surface as
	// S ("O9/OS/2Oo6"); in the digits-only timestamp every lookalike folds
	// to its digit. Match on the normalized line, keep the stage part's
	// original reading (the replacements are 1:1, so offsets line up).
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
	/**
	 * see TagBandOptions.tagLeadInMax; the battle log tags are not
	 * left-anchored
	 */
	tagLeadInMax?: number;
	/** see TagBandOptions.tagColumnFraction; the battle log tags are tilted */
	tagColumnFraction?: number;
}

const REPLAY_BANDS: ReplayHeaderBands = {
	top: HEADER_TOP_BAND,
	bottom: HEADER_BOTTOM_BAND,
};

export function parseReplayHeader(
	gray: Mat,
	topGlyphs: GlyphSet,
	bottomGlyphs: GlyphSet,
	bands: ReplayHeaderBands = REPLAY_BANDS,
): ParsedReplayHeader {
	const leadIn = {
		tagLeadInMax: bands.tagLeadInMax,
		tagColumnFraction: bands.tagColumnFraction,
	};
	let top = parseTopBand(readTagBand(gray, bands.top, topGlyphs, leadIn));
	if (top.stage === null) {
		const retry = parseTopBand(
			readTagBand(gray, bands.top, topGlyphs, {
				...leadIn,
				tagDarkMax: TAG_DARK_MAX_LIFTED,
			}),
		);
		if (retry.stageScore >= top.stageScore) top = retry;
	}

	let bottomReading = readTagBand(gray, bands.bottom, bottomGlyphs, leadIn);
	let bottomMatch = bottomReading
		? closestBy(bottomReading, LOBBY_MODE_COMBOS, (c) => c.text)
		: null;
	if (!bottomMatch || bottomMatch.score < MIN_MATCH_SCORE) {
		const reading = readTagBand(gray, bands.bottom, bottomGlyphs, {
			...leadIn,
			tagDarkMax: TAG_DARK_MAX_LIFTED,
		});
		const match = reading
			? closestBy(reading, LOBBY_MODE_COMBOS, (c) => c.text)
			: null;
		if ((match?.score ?? 0) >= (bottomMatch?.score ?? 0)) {
			bottomReading = reading;
			bottomMatch = match;
		}
	}

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
