/** Number field parsing on top of glyph recognition. */
import type { Mat } from "../../cv";
import {
	type GlyphSet,
	type RecognizedText,
	recognizeText,
} from "../../glyphs";

export interface ParsedNumber {
	value: number | null;
	/** min glyph score across recognized digits */
	confidence: number;
	/** x of the leftmost digit, relative to the crop (null when nothing found) */
	leftX: number | null;
	raw: RecognizedText;
}

/** A lowercase "p" suffix starts ~7px below the digits' cap line; a trailing char this far down is the suffix. */
const LOWERED_TRAILING_MIN_PX = 5;

export function parseNumber(
	gray: Mat,
	digits: GlyphSet,
	options: { binThreshold?: number; dropLoweredTrailing?: boolean } = {},
): ParsedNumber {
	const raw = recognizeText(gray, digits, {
		spaceGap: Number.POSITIVE_INFINITY,
		minCharScore: 0.3,
		binThreshold: options.binThreshold,
	});
	// the replay paint's "p" suffix can land inside the ROI and misread as a "6"
	let chars = raw.chars;
	if (options.dropLoweredTrailing && chars.length > 1) {
		const capY0 = Math.min(...chars.slice(0, -1).map((c) => c.y0));
		if (chars[chars.length - 1]!.y0 - capY0 >= LOWERED_TRAILING_MIN_PX) {
			chars = chars.slice(0, -1);
		}
	}
	const text = chars.map((c) => c.char).join("");
	const isNumeric = /^[0-9]+$/.test(text);
	return {
		value: isNumeric ? Number.parseInt(text, 10) : null,
		confidence:
			chars.length > 0
				? Math.min(...chars.map((c) => c.score))
				: raw.confidence,
		leftX: chars.length > 0 ? chars[0]!.x0 : null,
		raw,
	};
}
