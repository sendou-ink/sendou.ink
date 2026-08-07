/**
 * ScoreboardBattleLogDetector: parses the Recent Battles detail screen
 * (battle log) — the same match data as the live scoreboard (header, team
 * scores, 8 player rows) plus the recording timestamp, but no replay code.
 *
 * The two team panels sit STACKED (observed winner on top, confirmed by the
 * VICTORY/DEFEAT tags) and the row text renders at the live scoreboard's
 * sizes, so field parsing reuses the scoreboard helpers with the shared
 * glyph sets unscaled — only the ROI geometry is this screen's own. The
 * header is the replay browser's (timestamp + stage / lobby + mode tags),
 * parsed with battle log bands.
 */
import { getCV, type Mat } from "../../cv";
import { type GlyphSet, recognizeText, scaleGlyphSet } from "../../glyphs";
import {
	cropRoi,
	maxBrightness,
	maxChannel,
	meanBrightness,
	roiSignature,
} from "../../image";
import { RESULT_TAG_ENTRIES } from "../../localized";
import { closestBy } from "../../text";
import {
	type BannerScoreRead,
	FULL_COUNT_TEAM_SCORE,
	parseBannerScore,
	resolveMatchScores,
} from "../scoreboard/banner";
import { type ParsedNumber, parseNumber } from "../scoreboard/digits";
import type {
	ScoreboardData,
	ScoreboardPlayer,
	ScoreboardResources,
	ScoreboardRowDebug,
} from "../scoreboard/index";
import { findPovIndex } from "../scoreboard/pov";
import { parseScoreboardRow, type RowRois } from "../scoreboard/row";
import {
	type ParsedReplayHeader,
	parseReplayHeader,
} from "../scoreboard-battle-log-replay/header";
import type { DetectedEvent, Detector, GateResult } from "../types";
import {
	GATE_COLOR_MIN_SATURATION,
	GATE_COLOR_PROBES,
	GATE_DARK_MAX_MEAN,
	GATE_TEXT_MIN_MAX,
	gateDarkProbe,
	HEADER_BOTTOM_BAND,
	HEADER_LINE_HEIGHT,
	HEADER_TAG_COLUMN_FRACTION,
	HEADER_TAG_LEAD_IN_MAX,
	HEADER_TIMESTAMP_HEIGHT,
	HEADER_TOP_BAND,
	MATCH_SCORE_DIGIT_HEIGHT,
	MATCH_SCORE_ROIS,
	nameRoi,
	PANEL_DYS,
	paintRoi,
	paintSuffixRoi,
	povArrowRoi,
	RESULT_TAG_TEXT_HEIGHT,
	ROW_CENTERS,
	resultTagRoi,
	specialIconRoi,
	statRoi,
	teamScoreRoi,
	weaponRoi,
} from "./rois";

export interface ScoreboardBattleLogData extends ScoreboardData {
	/** recording timestamp as shown, e.g. "5/8/2026 19:16"; locale-formatted */
	timestamp: string | null;
}

export const SCOREBOARD_BATTLE_LOG_EVENT_TYPE = "ScoreboardBattleLog";

/**
 * White outlined team totals on the panel's saturated color band — a yellow
 * band grays at ~190, so binarize just above it (the digit cores are ~250).
 */
const TEAM_SCORE_BIN_THRESHOLD = 205;

/** Canonical results the localized VICTORY/DEFEAT panel tags snap to. */
type PanelResult = "VICTORY" | "DEFEAT";
const RESULT_MIN_SCORE = 0.6;
/**
 * The tag letters render in the team's ink color on the gray stamp box
 * (~75 gray, trailing status icons ~120), so binarize the max-channel
 * image just above the icons — every ink color's brightest channel
 * clears this.
 */
const RESULT_TAG_BIN_THRESHOLD = 140;

interface PanelParse {
	players: ScoreboardPlayer[];
	rows: ScoreboardRowDebug[];
	teamScore: ParsedNumber | null;
	result: PanelResult | null;
	resultReading: string;
	resultScore: number;
	confidences: number[];
}

export function createScoreboardBattleLogDetector(
	resources: ScoreboardResources,
): Detector<ScoreboardBattleLogData> {
	const cv = getCV();

	const scaled = (set: GlyphSet | null, height: number): GlyphSet | null =>
		set ? scaleGlyphSet(set, height / set.height) : null;

	const teamDigits = resources.teamDigits ?? resources.paintDigits;
	const matchScoreSets = teamDigits
		? [scaleGlyphSet(teamDigits, MATCH_SCORE_DIGIT_HEIGHT / teamDigits.height)]
		: [];
	/** Timestamp needs digits + '/' + ':' — only the names atlas has them. */
	const headerTopGlyphs = scaled(resources.nameGlyphs, HEADER_TIMESTAMP_HEIGHT);
	const headerBottomGlyphs = scaled(
		resources.headerLineGlyphs,
		HEADER_LINE_HEIGHT,
	);
	// The tags render in FOT-RowdyStd — use the dedicated atlas when present;
	// the BlitzMain-based fallback reads them only roughly.
	const resultGlyphs =
		scaled(resources.replayResultGlyphs ?? null, RESULT_TAG_TEXT_HEIGHT) ??
		scaled(resources.headerLineGlyphs, RESULT_TAG_TEXT_HEIGHT);

	/** Mean-RGB saturation (max minus min channel) of a probe ROI. */
	function probeSaturation(frame: Mat, roi: (typeof GATE_COLOR_PROBES)[0]) {
		const view = cropRoi(frame, roi);
		const cont = new cv.Mat();
		view.copyTo(cont);
		view.delete();
		const d = cont.data;
		const n = cont.rows * cont.cols;
		let r = 0;
		let g = 0;
		let b = 0;
		for (let i = 0; i < n; i++) {
			r += d[i * 4]!;
			g += d[i * 4 + 1]!;
			b += d[i * 4 + 2]!;
		}
		cont.delete();
		if (n === 0) return 0;
		return (Math.max(r, g, b) - Math.min(r, g, b)) / n;
	}

	function gate(frame: Mat): GateResult {
		const gray = new cv.Mat();
		cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);

		let darkOk = 0;
		let suffixOk = 0;
		for (const dy of PANEL_DYS) {
			for (const base of ROW_CENTERS) {
				const cy = base + dy;
				if (meanBrightness(frame, gateDarkProbe(cy)) < GATE_DARK_MAX_MEAN)
					darkOk++;
				if (maxBrightness(gray, paintSuffixRoi(cy)) > GATE_TEXT_MIN_MAX)
					suffixOk++;
			}
		}
		let colorOk = 0;
		for (const roi of GATE_COLOR_PROBES) {
			if (probeSaturation(frame, roi) >= GATE_COLOR_MIN_SATURATION) colorOk++;
		}

		const rowCount = PANEL_DYS.length * ROW_CENTERS.length;
		const score =
			(darkOk / rowCount +
				suffixOk / rowCount +
				colorOk / GATE_COLOR_PROBES.length) /
			3;
		const pass = darkOk >= 7 && suffixOk >= 7 && colorOk === 3;
		// browsing flips between entries never drop this gate, so it
		// fingerprints the content that always differs between two battles
		// (recording timestamp + stage tag) plus the name column — the
		// scheduler re-arms suppression when the fingerprint moves
		const signature = pass ? contentSignature(gray) : undefined;
		gray.delete();
		return { pass, score, signature };
	}

	function contentSignature(gray: Mat): number[] {
		const signature = roiSignature(gray, HEADER_TOP_BAND, 32, 2);
		for (const dy of PANEL_DYS) {
			for (const base of ROW_CENTERS) {
				signature.push(...roiSignature(gray, nameRoi(base + dy), 8, 1));
			}
		}
		return signature;
	}

	function parsePanel(gray: Mat, rgb: Mat, dy: number): PanelParse {
		const players: ScoreboardPlayer[] = [];
		const rows: ScoreboardRowDebug[] = [];
		const confidences: number[] = [];

		const rowRois: RowRois = {
			weapon: weaponRoi,
			specialIcon: specialIconRoi,
			paint: paintRoi,
			name: nameRoi,
			stat: statRoi,
			povArrow: povArrowRoi,
		};
		for (const base of ROW_CENTERS) {
			const row = parseScoreboardRow(
				gray,
				rgb,
				base + dy,
				rowRois,
				resources,
				confidences,
			);
			players.push(row.player);
			rows.push(row.debug);
		}

		// The panel's point total is read only to recognize a knockout (the
		// count times five: only a knockout's full count reaches 500); it is
		// never emitted as a score.
		let teamScore: ParsedNumber | null = null;
		if (teamDigits) {
			const crop = cropRoi(gray, teamScoreRoi(dy));
			teamScore = parseNumber(crop, teamDigits, {
				binThreshold: TEAM_SCORE_BIN_THRESHOLD,
			});
			crop.delete();
			confidences.push(teamScore.confidence);
		}

		let result: PanelParse["result"] = null;
		let resultReading = "";
		let resultScore = 0;
		if (resultGlyphs) {
			const bright = maxChannel(rgb, resultTagRoi(dy));
			const raw = recognizeText(bright, resultGlyphs, {
				binThreshold: RESULT_TAG_BIN_THRESHOLD,
				spaceGap: Number.POSITIVE_INFINITY,
				minCharScore: 0.25,
			});
			bright.delete();
			resultReading = raw.text;
			if (resultReading) {
				const match = closestBy(
					resultReading,
					RESULT_TAG_ENTRIES,
					(e) => e.text,
				);
				if (match) {
					resultScore = match.score;
					if (match.score >= RESULT_MIN_SCORE)
						result = match.entry.canonical as PanelResult;
				}
			}
		}

		return {
			players,
			rows,
			teamScore,
			result,
			resultReading,
			resultScore,
			confidences,
		};
	}

	function parse(
		frame: Mat,
		t: number,
	): DetectedEvent<ScoreboardBattleLogData>[] {
		const gray = new cv.Mat();
		cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
		const rgb = new cv.Mat();
		cv.cvtColor(frame, rgb, cv.COLOR_RGBA2RGB);

		const [top, bottom] = PANEL_DYS.map((dy) => parsePanel(gray, rgb, dy)) as [
			PanelParse,
			PanelParse,
		];

		let left: BannerScoreRead | null = null;
		let right: BannerScoreRead | null = null;
		if (matchScoreSets.length > 0) {
			left = parseBannerScore(gray, MATCH_SCORE_ROIS[0], matchScoreSets);
			right = parseBannerScore(gray, MATCH_SCORE_ROIS[1], matchScoreSets);
		}

		const swapped = decideSwapped(top, bottom, left, right);
		const [winner, loser] = swapped ? [bottom, top] : [top, bottom];
		// POV arrow row, indexed into the winners-first players ordering
		const povIndex = findPovIndex(
			[...winner.rows, ...loser.rows].map((r) => r.povFraction),
		);

		const knockout = winner.teamScore?.value === FULL_COUNT_TEAM_SCORE;
		let matchScores: [number | null, number | null] = [null, null];
		let bannerDebug: object | undefined;
		if (left && right) {
			matchScores = resolveMatchScores({ left, right, knockout });
			winner.confidences.push(left.confidence, right.confidence);
			bannerDebug = { left, right, knockout };
		}

		let header: ParsedReplayHeader | null = null;
		if (headerTopGlyphs && headerBottomGlyphs) {
			header = parseReplayHeader(gray, headerTopGlyphs, headerBottomGlyphs, {
				top: HEADER_TOP_BAND,
				bottom: HEADER_BOTTOM_BAND,
				tagLeadInMax: HEADER_TAG_LEAD_IN_MAX,
				tagColumnFraction: HEADER_TAG_COLUMN_FRACTION,
			});
		}

		gray.delete();
		rgb.delete();

		const confidences = [
			...winner.confidences,
			...loser.confidences,
			...(header ? [header.confidence] : []),
		];
		const confidence =
			confidences.length > 0
				? confidences.reduce((a, b) => a + b, 0) / confidences.length
				: 0;

		return [
			{
				type: SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
				t,
				confidence,
				data: {
					lobby: header?.lobby ?? null,
					mode: header?.mode ?? null,
					stage: header?.stage ?? null,
					timestamp: header?.timestamp ?? null,
					matchScores,
					players: [...winner.players, ...loser.players],
					povIndex,
				},
				debug: {
					rows: [...winner.rows, ...loser.rows],
					teamScoreConf: [
						winner.teamScore?.confidence ?? 0,
						loser.teamScore?.confidence ?? 0,
					],
					matchScore: bannerDebug,
					header: header?.debug,
					winnerSide: swapped ? "bottom" : "top",
					resultTags: {
						top: {
							reading: top.resultReading,
							score: top.resultScore,
							result: top.result,
						},
						bottom: {
							reading: bottom.resultReading,
							score: bottom.resultScore,
							result: bottom.result,
						},
					},
				},
			},
		];
	}

	// no rearm cooldown — distinct battles browsed in quick succession are
	// told apart by content: the gate signature re-arms scheduler suppression
	// and the timeline merges via sameScoreboardMatch (same as the replay
	// browser)
	return {
		id: "scoreboard-battle-log",
		sufficientConfidence: 0.8,
		gate,
		parse,
	};
}

/**
 * Whether the winner sits in the bottom panel. A confident VICTORY/DEFEAT
 * tag decides (the distressed tag texture usually reads below the floor);
 * otherwise the panel totals are checked against the banner scores — the
 * total is the count times five, and only a knockout winner's reaches 500.
 * Default: winner on top, which every observed battle log screen shows.
 */
function decideSwapped(
	top: PanelParse,
	bottom: PanelParse,
	left: BannerScoreRead | null,
	right: BannerScoreRead | null,
): boolean {
	if (top.result !== null || bottom.result !== null) {
		return top.result === "DEFEAT" || bottom.result === "VICTORY";
	}
	const topTotal = top.teamScore?.value ?? null;
	const bottomTotal = bottom.teamScore?.value ?? null;
	if (topTotal === FULL_COUNT_TEAM_SCORE) return false;
	if (bottomTotal === FULL_COUNT_TEAM_SCORE) return true;
	if (
		left?.value != null &&
		right?.value != null &&
		topTotal !== null &&
		bottomTotal !== null &&
		topTotal !== bottomTotal
	) {
		const hi = Math.max(left.value, right.value) * 5;
		const lo = Math.min(left.value, right.value) * 5;
		if (topTotal === lo && bottomTotal === hi) return true;
	}
	return false;
}
