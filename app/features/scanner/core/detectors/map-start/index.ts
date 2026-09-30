/**
 * MapStartDetector: parses the match-intro splash — mode title on the black
 * center splat and stage name bottom-right, snapped to the localized closed sets
 * (core/localized.ts). The title wraps to two lines, so parse finds line bands
 * by row projection and snaps the joined reading; the constant "MODE" label is
 * the parse-time confirmation. Bright stages leak background past text edges:
 * the title block is masked to near-dark for line finding only (raw crop OCRs
 * better) and the stage line reads its min channel under several binarizations.
 */
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { getCV, type Mat, minMaxLoc } from "../../cv";
import {
	type GlyphSet,
	type RecognizedText,
	recognizeText,
	scaleGlyphSet,
} from "../../glyphs";
import { copyRoi, meanBrightness, minChannel } from "../../image";
import {
	ALL_MODE_ENTRIES,
	ALL_MODE_LABELS,
	ALL_STAGE_ENTRIES,
} from "../../localized";
import { closestBy } from "../../text";
import type { ScoreboardResources } from "../scoreboard/index";
import type { DetectedEvent, Detector, GateResult } from "../types";
import {
	BLOCK_MASK_RADIUS,
	GATE_DARK_MAX_MEAN,
	GATE_DARK_PROBES,
	GATE_INK_BAND,
	GATE_INK_BAND_MAX_BRIGHT,
	GATE_INK_BAND_MIN_DARK,
	GATE_TEXT_MAX_FRACTION,
	GATE_TEXT_MIN_FRACTION,
	GATE_TEXT_MIN_MAX,
	LINE_GAP_TOLERANCE,
	LINE_MIN_HEIGHT,
	LINE_MIN_ROW_PIXELS,
	LINE_ROW_FRACTION,
	MASK_DARK_MAX,
	MODE_BLOCK_ROI,
	MODE_LABEL_ROI,
	MODE_LABEL_TEXT_HEIGHT,
	MODE_TEXT_HEIGHT,
	STAGE_BIN_THRESHOLD,
	STAGE_MASK_RADIUS,
	STAGE_RAW_BIN_THRESHOLDS,
	STAGE_ROI,
	STAGE_TEXT_HEIGHT,
	TEXT_BIN_THRESHOLD,
} from "./rois";

export interface MapStartData {
	mode: ModeShort | null;
	stage: StageId | null;
}

export const MAP_START_EVENT_TYPE = "MapStart";

/** "MODE" must read back at least this well for parse to emit. */
const LABEL_MIN_SCORE = 0.5;
/** Accept a closed-set match only above this score (1 = exact). */
const MIN_MATCH_SCORE = 0.62;

interface LineBand {
	y0: number;
	y1: number;
}

/** Zero every pixel with no near-black pixel within `radius` of it. */
function maskNearDark(gray: Mat, radius: number): Mat {
	const cv = getCV();
	const dark = new cv.Mat();
	cv.threshold(gray, dark, MASK_DARK_MAX, 255, cv.THRESH_BINARY_INV);
	const kernel = cv.getStructuringElement(
		cv.MORPH_ELLIPSE,
		new cv.Size(2 * radius + 1, 2 * radius + 1),
	);
	const near = new cv.Mat();
	cv.dilate(dark, near, kernel);
	kernel.delete();
	dark.delete();
	const out = new cv.Mat(gray.rows, gray.cols, cv.CV_8UC1, new cv.Scalar(0));
	gray.copyTo(out, near);
	near.delete();
	return out;
}

/** Find text line bands in a binarized block by row projection. */
function findLineBands(binary: Mat): LineBand[] {
	const { rows, cols, data } = binary;
	const counts = new Array<number>(rows).fill(0);
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			if (data[y * cols + x]! > 0) counts[y]!++;
		}
	}
	// dual threshold: band core scaled to the strongest row (background leak sets a
	// scene-dependent noise floor), then extended over a fixed floor to keep
	// antialiased glyph tops/bottoms inside
	const core = Math.max(
		LINE_MIN_ROW_PIXELS,
		LINE_ROW_FRACTION * Math.max(...counts),
	);
	const bands: LineBand[] = [];
	let start = -1;
	let gap = 0;
	for (let y = 0; y < rows; y++) {
		if (counts[y]! >= core) {
			if (start < 0) start = y;
			gap = 0;
		} else if (start >= 0 && ++gap > LINE_GAP_TOLERANCE) {
			bands.push({ y0: start, y1: y - gap + 1 });
			start = -1;
		}
	}
	if (start >= 0) bands.push({ y0: start, y1: rows - gap });

	for (const band of bands) {
		while (band.y0 > 0 && counts[band.y0 - 1]! >= LINE_MIN_ROW_PIXELS)
			band.y0--;
		while (band.y1 < rows && counts[band.y1]! >= LINE_MIN_ROW_PIXELS) band.y1++;
	}
	const merged: LineBand[] = [];
	for (const band of bands) {
		const last = merged[merged.length - 1];
		if (last && band.y0 <= last.y1) last.y1 = Math.max(last.y1, band.y1);
		else merged.push(band);
	}
	return merged.filter((b) => b.y1 - b.y0 >= LINE_MIN_HEIGHT);
}

/** Trim a line band to its text columns so the raw OCR crop excludes edge background. */
function bandExtent(
	binary: Mat,
	band: LineBand,
): { x0: number; x1: number } | null {
	const { cols, data } = binary;
	let x0 = -1;
	let x1 = -1;
	for (let x = 0; x < cols; x++) {
		let count = 0;
		for (let y = band.y0; y < band.y1; y++) {
			if (data[y * cols + x]! > 0) count++;
		}
		if (count >= 2) {
			if (x0 < 0) x0 = x;
			x1 = x;
		}
	}
	return x0 < 0 ? null : { x0, x1 };
}

export function createMapStartDetector(
	resources: ScoreboardResources,
): Detector<MapStartData> {
	const cv = getCV();

	const scaled = (
		set: GlyphSet | null | undefined,
		height: number,
	): GlyphSet | null => (set ? scaleGlyphSet(set, height / set.height) : null);

	const modeGlyphs = scaled(resources.mapStartModeGlyphs, MODE_TEXT_HEIGHT);
	const stageGlyphs = scaled(resources.mapStartStageGlyphs, STAGE_TEXT_HEIGHT);
	const labelGlyphs = scaled(
		resources.mapStartStageGlyphs,
		MODE_LABEL_TEXT_HEIGHT,
	);

	function gate(frame: Mat): GateResult {
		let darkOk = 0;
		for (const roi of GATE_DARK_PROBES) {
			if (meanBrightness(frame, roi) < GATE_DARK_MAX_MEAN) darkOk++;
		}

		const gray = new cv.Mat();
		cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);

		const label = copyRoi(gray, MODE_LABEL_ROI);
		const { maxVal } = minMaxLoc(label);
		const bin = new cv.Mat();
		cv.threshold(label, bin, TEXT_BIN_THRESHOLD, 255, cv.THRESH_BINARY);
		label.delete();
		const whiteFraction = cv.countNonZero(bin) / (bin.rows * bin.cols);
		bin.delete();
		const textOk =
			maxVal > GATE_TEXT_MIN_MAX &&
			whiteFraction > GATE_TEXT_MIN_FRACTION &&
			whiteFraction < GATE_TEXT_MAX_FRACTION;

		// label-to-title gap is solid ink here: near-totally dark (scoreboard pills
		// aren't) with no bright pixels (death's "Splatted by" line crosses it)
		const band = copyRoi(gray, GATE_INK_BAND);
		const bandPixels = band.rows * band.cols;
		const bandBright = new cv.Mat();
		cv.threshold(band, bandBright, TEXT_BIN_THRESHOLD, 255, cv.THRESH_BINARY);
		const brightFraction = cv.countNonZero(bandBright) / bandPixels;
		bandBright.delete();
		const bandDark = new cv.Mat();
		cv.threshold(band, bandDark, MASK_DARK_MAX, 255, cv.THRESH_BINARY_INV);
		const darkFraction = cv.countNonZero(bandDark) / bandPixels;
		bandDark.delete();
		band.delete();
		const inkOk =
			brightFraction <= GATE_INK_BAND_MAX_BRIGHT &&
			darkFraction >= GATE_INK_BAND_MIN_DARK;
		gray.delete();

		const score =
			(darkOk / GATE_DARK_PROBES.length + (textOk ? 1 : 0) + (inkOk ? 1 : 0)) /
			3;
		return {
			pass: darkOk === GATE_DARK_PROBES.length && textOk && inkOk,
			score,
		};
	}

	function parse(frame: Mat, t: number): DetectedEvent<MapStartData>[] {
		const gray = new cv.Mat();
		cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);

		// 1. confirm the constant label — a gate hit without it is a lookalike
		let label: RecognizedText | null = null;
		let labelScore = 0;
		if (labelGlyphs) {
			const crop = copyRoi(gray, MODE_LABEL_ROI);
			label = recognizeText(crop, labelGlyphs, {
				binThreshold: TEXT_BIN_THRESHOLD,
				minCharScore: 0.3,
			});
			crop.delete();
			labelScore = closestBy(label.text, ALL_MODE_LABELS, (l) => l)?.score ?? 0;
			if (labelScore < LABEL_MIN_SCORE) {
				gray.delete();
				return [];
			}
		}

		// 2. mode title: find the 1-2 text lines, OCR each, snap the joined text
		let mode: ModeShort | null = null;
		let modeScore = 0;
		let modeReading = "";
		if (modeGlyphs) {
			const block = copyRoi(gray, MODE_BLOCK_ROI);
			// find bands on the masked block (bright background merges/invents bands)
			// but OCR the raw crop (masking clips strokes)
			const masked = maskNearDark(block, BLOCK_MASK_RADIUS);
			const binary = new cv.Mat();
			cv.threshold(masked, binary, TEXT_BIN_THRESHOLD, 255, cv.THRESH_BINARY);
			masked.delete();
			const bands = findLineBands(binary);
			const lines: string[] = [];
			for (const band of bands) {
				const extent = bandExtent(binary, band);
				if (!extent) continue;
				const pad = 3;
				const y0 = Math.max(0, band.y0 - pad);
				const x0 = Math.max(0, extent.x0 - pad);
				const line = copyRoi(block, {
					x: x0,
					y: y0,
					w: Math.min(block.cols, extent.x1 + 1 + pad) - x0,
					h: Math.min(block.rows, band.y1 + pad) - y0,
				});
				const read = recognizeText(line, modeGlyphs, {
					binThreshold: TEXT_BIN_THRESHOLD,
					minCharScore: 0.3,
				});
				line.delete();
				if (read.text.trim()) lines.push(read.text.trim());
			}
			binary.delete();
			block.delete();
			modeReading = lines.join(" ");
			const match = modeReading
				? closestBy(modeReading, ALL_MODE_ENTRIES, (e) => e.text)
				: null;
			if (match) {
				modeScore = match.score;
				if (match.score >= MIN_MATCH_SCORE) mode = match.entry.mode;
			}
		}

		// 3. stage name over live gameplay: no single binarization works everywhere,
		// so try the masked crop plus raw crop at rising thresholds, keep the best snap
		let stage: StageId | null = null;
		let stageScore = 0;
		let stageReading = "";
		if (stageGlyphs) {
			const rgbaCrop = copyRoi(frame, STAGE_ROI);
			const bright = minChannel(rgbaCrop);
			rgbaCrop.delete();
			const masked = maskNearDark(bright, STAGE_MASK_RADIUS);
			const attempts: [Mat, number][] = [
				[masked, STAGE_BIN_THRESHOLD],
				...STAGE_RAW_BIN_THRESHOLDS.map((thr): [Mat, number] => [bright, thr]),
			];
			for (const [input, binThreshold] of attempts) {
				const read = recognizeText(input, stageGlyphs, {
					binThreshold,
					minCharScore: 0.3,
				});
				const match = read.text
					? closestBy(read.text, ALL_STAGE_ENTRIES, (e) => e.text)
					: null;
				if (match && match.score > stageScore) {
					stageScore = match.score;
					stageReading = read.text;
					if (match.score >= MIN_MATCH_SCORE) stage = match.entry.stageId;
				}
			}
			masked.delete();
			bright.delete();
		}

		gray.delete();

		return [
			{
				type: MAP_START_EVENT_TYPE,
				t,
				// mean, so a clean mode read survives an unreadable stage (map-start is
				// the only mode source for VoD matches)
				confidence: (modeScore + stageScore) / 2,
				data: { mode, stage },
				debug: {
					label: label?.text,
					labelScore,
					modeReading,
					modeScore,
					stageReading,
					stageScore,
				},
			},
		];
	}

	// just under the clean-read floor (fixtures 0.795-0.864, scan events 0.854-1.0)
	return {
		id: "map-start",
		sufficientConfidence: 0.79,
		gate,
		parse,
	};
}
