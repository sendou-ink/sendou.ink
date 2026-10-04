/**
 * XSetResultDetector: the X Battle card after the deciding game — "2 - 3",
 * one VICTORY/DEFEAT tile per game in play order (three on the first row, two
 * on the second; four games two over two), and the X Power panel. The tiles pop in one by one, the
 * panel first shows the power before the set, then the signed change lands
 * in the splat and the power counts toward the new value for ~0.3s before
 * the card fades. A read only counts once the header agrees with a decided
 * set of tiles, and the timeline keeps the furthest-along read
 * (`xSetResultProgress`).
 */
import type { RankedModeShort } from "~/modules/in-game-lists/types";
import type { Mat } from "../../cv";
import { type GlyphSet, scaleGlyphSet } from "../../glyphs";
import {
	copyRoi,
	frameGray,
	frameRgb,
	type Roi,
	roiSignature,
} from "../../image";
import { all, type MatchSteps, runSync } from "../../match-steps";
import type { ScoreboardResources } from "../scoreboard/index";
import type { DetectedEvent, Detector, GateResult } from "../types";
import {
	CARD_DARK_MAX_MEAN,
	CARD_ICON_ROI,
	NUMBER_BIN_THRESHOLD,
	PANEL_DARK_MAX_MEAN,
	RESULT_CHANGE_BIN_THRESHOLD,
	RESULT_CHANGE_HEIGHT,
	RESULT_CHANGE_ROI,
	RESULT_DARK_PROBES,
	RESULT_HEADER_HEIGHT,
	RESULT_HEADER_ROI,
	RESULT_PANEL_PROBES,
	RESULT_POWER_HEIGHT,
	RESULT_POWER_ROI,
	RESULT_SIGNATURE_ROI,
	RESULT_TILE_ROWS,
	RESULT_TILE_TEXT_MAX_GAP,
	RESULT_TILE_TEXT_MIN_WIDTH,
} from "./rois";
import {
	allDark,
	brightFraction,
	minScore,
	type NumberRead,
	readModeIconSteps,
	readNumberSteps,
} from "./shared";

export const X_SET_RESULT_EVENT_TYPE = "XSetResult";

export type XSetGameResult = "WIN" | "LOSE";

export interface XSetResultData {
	mode: RankedModeShort | null;
	/** play order (row-major tiles), 3-5 entries; the "2 - 3" header is derived and only cross-checks confidence */
	results: XSetGameResult[];
	/** signed, e.g. -29.2; null while the splat hasn't appeared */
	powerChange: number | null;
	/** after the change */
	power: number | null;
}

const POWER_MIN_FRACTION = 0.05;
const POWER_MAX_FRACTION = 0.6;
/** Number reads below this are left null rather than guessed. */
const NUMBER_MIN_SCORE = 0.5;
const SET_WINS_NEEDED = 3;
/** Confidence of a read whose header and tiles don't describe one decided set (tiles still popping in): under the timeline floor. */
const UNDECIDED_CONFIDENCE = 0.3;
/** X Power has one decimal; float noise in differences stays under this. */
const POWER_EPSILON = 0.05;

/**
 * Timeline animation order of two reads of one card: positive when `b` is
 * further along — more tiles, then the change shown, then the power counted
 * further toward its new value. A power further away than the whole change
 * can't lie on the same count, so it's a misread and orders nothing.
 */
export function xSetResultProgress(a: unknown, b: unknown): number {
	const da = a as XSetResultData;
	const db = b as XSetResultData;
	if (da.results.length !== db.results.length) {
		return db.results.length - da.results.length;
	}
	const shown = (d: XSetResultData) => (d.powerChange === null ? 0 : 1);
	if (shown(da) !== shown(db)) return shown(db) - shown(da);
	if (da.power === null || db.power === null || db.powerChange === null) {
		return 0;
	}
	const delta = db.power - da.power;
	if (Math.abs(delta) > Math.abs(db.powerChange) + POWER_EPSILON) return 0;
	return Math.sign(delta * Math.sign(db.powerChange));
}

export function createXSetResultDetector(
	resources: ScoreboardResources,
): Detector<XSetResultData> {
	const sets = new Map<number, GlyphSet | null>();
	const digitGlyphs = (height: number) => {
		if (!sets.has(height)) {
			sets.set(
				height,
				resources.teamDigits
					? scaleGlyphSet(
							resources.teamDigits,
							height / resources.teamDigits.height,
						)
					: null,
			);
		}
		return sets.get(height) ?? null;
	};

	function gate(frame: Mat): GateResult {
		const gray = frameGray(frame);
		const rgb = frameRgb(frame);
		const dark =
			allDark(gray, RESULT_DARK_PROBES, CARD_DARK_MAX_MEAN) &&
			allDark(gray, RESULT_PANEL_PROBES, PANEL_DARK_MAX_MEAN);
		const firstTile = rowResults(rgb, RESULT_TILE_ROWS[0]!).length > 0;
		const power = brightFraction(gray, RESULT_POWER_ROI, NUMBER_BIN_THRESHOLD);
		const checks = [
			dark,
			firstTile,
			power >= POWER_MIN_FRACTION && power <= POWER_MAX_FRACTION,
		];
		const pass = checks.every(Boolean);
		return {
			pass,
			score: checks.filter(Boolean).length / checks.length,
			signature: pass
				? roiSignature(gray, RESULT_SIGNATURE_ROI, 10, 6)
				: undefined,
		};
	}

	function* parseSteps(
		frame: Mat,
		t: number,
		_gate: GateResult | undefined,
		speculative: boolean,
	): MatchSteps<DetectedEvent<XSetResultData>[]> {
		const headerSet = digitGlyphs(RESULT_HEADER_HEIGHT);
		const powerSet = digitGlyphs(RESULT_POWER_HEIGHT);
		const changeSet = digitGlyphs(RESULT_CHANGE_HEIGHT);
		if (!headerSet || !powerSet || !changeSet) return [];
		const gray = frameGray(frame);
		const rgb = frameRgb(frame);
		const [header, power, change, icon] = yield* all([
			readNumberSteps(
				gray,
				RESULT_HEADER_ROI,
				headerSet,
				NUMBER_BIN_THRESHOLD,
				speculative,
			),
			readNumberSteps(
				gray,
				RESULT_POWER_ROI,
				powerSet,
				NUMBER_BIN_THRESHOLD,
				speculative,
			),
			readNumberSteps(
				gray,
				RESULT_CHANGE_ROI,
				changeSet,
				RESULT_CHANGE_BIN_THRESHOLD,
				speculative,
				"sign",
			),
			readModeIconSteps(rgb, CARD_ICON_ROI, resources.modeIcons),
		]);

		const results = RESULT_TILE_ROWS.flatMap((row) => rowResults(rgb, row));
		const headerScore = minScore(header.digitScores);
		const headerMatch = /^(\d)-(\d)$/.exec(header.text);
		const wins = results.filter((r) => r === "WIN").length;
		const losses = results.length - wins;
		const decided =
			headerMatch !== null &&
			Number(headerMatch[1]) === wins &&
			Number(headerMatch[2]) === losses &&
			Math.max(wins, losses) === SET_WINS_NEEDED;

		return [
			{
				type: X_SET_RESULT_EVENT_TYPE,
				t,
				confidence: decided
					? headerScore
					: Math.min(headerScore, UNDECIDED_CONFIDENCE),
				data: {
					mode: icon.mode,
					results,
					powerChange: parsedNumber(change, /^[+-]\d{1,3}\.\d$/),
					power: parsedNumber(power, /^\d{1,4}\.\d$/),
				},
				debug: {
					headerReading: header.text,
					headerScore,
					powerReading: power.text,
					powerScore: minScore(power.digitScores),
					changeReading: change.text,
					changeScore: minScore(change.digitScores),
					modeScore: icon.score,
				},
			},
		];
	}

	return {
		id: "x-set-result",
		gate,
		parse: (frame, t, gateResult) =>
			runSync(parseSteps(frame, t, gateResult, false)),
		parseSteps,
	};
}

/** One tile row's results left to right: runs of tile-colored text columns, each a tile's word. */
function rowResults(rgb: Mat, row: Roi): XSetGameResult[] {
	const crop = copyRoi(rgb, row);
	const { rows, cols } = crop;
	const data = crop.data;
	const victory = new Array<number>(cols).fill(0);
	const defeat = new Array<number>(cols).fill(0);
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			const i = (y * cols + x) * 3;
			const r = data[i]!;
			const g = data[i + 1]!;
			const b = data[i + 2]!;
			if (isVictoryYellow(r, g, b)) victory[x]!++;
			else if (isDefeatPurple(r, g, b)) defeat[x]!++;
		}
	}
	crop.delete();

	const results: XSetGameResult[] = [];
	let start = -1;
	let last = -1;
	const close = () => {
		if (start >= 0 && last + 1 - start >= RESULT_TILE_TEXT_MIN_WIDTH) {
			const sum = (counts: number[]) =>
				counts.slice(start, last + 1).reduce((a, b) => a + b, 0);
			results.push(sum(victory) > sum(defeat) ? "WIN" : "LOSE");
		}
		start = -1;
	};
	for (let x = 0; x < cols; x++) {
		if (victory[x]! + defeat[x]! === 0) continue;
		if (start >= 0 && x - last > RESULT_TILE_TEXT_MAX_GAP) close();
		if (start < 0) start = x;
		last = x;
	}
	close();
	return results;
}

function isVictoryYellow(r: number, g: number, b: number): boolean {
	return r >= 170 && g >= 170 && b <= 110;
}

function isDefeatPurple(r: number, g: number, b: number): boolean {
	return b >= 170 && b - g >= 60 && r < 170;
}

function parsedNumber(read: NumberRead, pattern: RegExp): number | null {
	if (
		minScore(read.digitScores) < NUMBER_MIN_SCORE ||
		!pattern.test(read.text)
	) {
		return null;
	}
	return Number(read.text);
}
