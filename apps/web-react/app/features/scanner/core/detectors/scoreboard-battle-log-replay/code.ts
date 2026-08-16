/**
 * Replay code recognition ("R6KE-DO64-3CXD-XVKL"): bright green text under
 * the team panels. Green on the dark background lands below the default
 * grayscale binarization threshold, so recognition runs on the green
 * channel, where the glyphs are near-white.
 */
import { getCV, type Mat } from "../../cv";
import {
	type GlyphSet,
	type RecognizedText,
	recognizeText,
} from "../../glyphs";
import { cropRoi } from "../../image";
import { REPLAY_CODE_ROI } from "./rois";

/**
 * FOT-RowdyStd's 'Q' is a '0' bowl with a small tail below the baseline;
 * the bowl dominates template correlation, so a real Q ranks as '0' by a
 * hair. Like the P/p rule in scoreboard/names.ts, the segment geometry
 * decides what the templates cannot: a 0/O read whose ink reaches well
 * below the line's baseline (the median ink bottom of the other
 * alphanumerics) is a Q.
 */
const Q_TWINS = new Set(["0", "O"]);
const Q_DESCENT_MIN_PX = 4;

function resolveQsByDescent(raw: RecognizedText): string {
	const anchors = raw.chars
		.filter((c) => !Q_TWINS.has(c.char) && c.char !== "-")
		.map((c) => c.y1)
		.sort((a, b) => a - b);
	if (anchors.length === 0) return raw.text;
	const baseline = anchors[Math.floor(anchors.length / 2)]!;
	return raw.chars
		.map((c) =>
			Q_TWINS.has(c.char) && c.y1 - baseline >= Q_DESCENT_MIN_PX ? "Q" : c.char,
		)
		.join("");
}

/**
 * On blurry captures a narrow 'L' template can edge out the true 'U' by a
 * hair. Segment geometry decides what templates can't: a U's right stroke
 * fills the segment's top-right quadrant, where an L has no ink (measured
 * 0.00-0.15 leak on true Ls vs 0.27+ on Us across fixtures). The margin only
 * skips confident reads and stays generous, since no true L on the fixtures
 * carries a 'U' candidate at all.
 */
const LU_SCORE_MARGIN = 0.12;
const LU_INK_THRESHOLD = 150;
const LU_TOP_RIGHT_MIN_FRACTION = 0.2;

function resolveUsByTopRightInk(
	raw: RecognizedText,
	green: Mat,
): RecognizedText {
	const { cols, data } = green;
	const chars = raw.chars.map((c) => {
		if (c.char !== "L") return c;
		const u = c.candidates?.find((k) => k.char === "U");
		if (!u || c.score - u.score > LU_SCORE_MARGIN) return c;
		const xMid = Math.ceil((c.x0 + c.x1) / 2);
		const yMid = Math.floor((c.y0 + c.y1) / 2);
		let ink = 0;
		let total = 0;
		for (let y = c.y0; y < yMid; y++) {
			for (let x = xMid; x < c.x1; x++) {
				total++;
				if (data[y * cols + x]! > LU_INK_THRESHOLD) ink++;
			}
		}
		return total > 0 && ink / total >= LU_TOP_RIGHT_MIN_FRACTION
			? { ...c, char: "U" }
			: c;
	});
	return { ...raw, chars, text: chars.map((c) => c.char).join("") };
}

export interface ParsedReplayCode {
	/** normalized "XXXX-XXXX-XXXX-XXXX", or null when the shape is wrong */
	code: string | null;
	/** min glyph score across recognized characters */
	confidence: number;
	raw: RecognizedText;
}

const CODE_RE = /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/;

/**
 * Restrict a glyph set to the characters codes can contain — a shallow
 * view over the same template mats, so dispose only the source set.
 */
export function codeCharsetOf(set: GlyphSet): GlyphSet {
	const glyphs = set.glyphs.filter((g) => /^[0-9A-Z-]$/.test(g.char));
	const widths = glyphs.map((g) => g.mat.cols).sort((a, b) => a - b);
	return {
		glyphs,
		height: set.height,
		medianWidth: widths[Math.floor(widths.length / 2)] ?? set.medianWidth,
	};
}

/** rgb: full normalized frame in RGB (not RGBA). */
export function parseReplayCode(rgb: Mat, glyphs: GlyphSet): ParsedReplayCode {
	const cv = getCV();
	const view = cropRoi(rgb, REPLAY_CODE_ROI);
	const channels = new cv.MatVector();
	cv.split(view, channels);
	const g = channels.get(1);
	const green = new cv.Mat();
	g.copyTo(green);
	g.delete();
	channels.delete();
	view.delete();

	const raw = recognizeText(green, glyphs, {
		spaceGap: Number.POSITIVE_INFINITY,
		minCharScore: 0.3,
	});
	const resolved = resolveUsByTopRightInk(raw, green);
	green.delete();

	let text = resolveQsByDescent(resolved).toUpperCase();
	// Dashes are thin and can drop out of segmentation (any subset of the
	// three); the 16 alphanumerics are unambiguous on their own, so re-derive
	// the grouping from them alone.
	const compact = text.replaceAll("-", "");
	if (/^[0-9A-Z]{16}$/.test(compact)) {
		text = compact.replace(/(.{4})(?=.)/g, "$1-");
	}
	return {
		code: CODE_RE.test(text) ? text : null,
		confidence: raw.confidence,
		raw,
	};
}
