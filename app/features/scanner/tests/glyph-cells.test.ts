/**
 * Glyphs as line-height cells, on drawn bitmaps (no fixtures, no atlas
 * checkout, but OpenCV): a shape that is two characters at two heights reads
 * by where it sits on its line.
 */
import { beforeAll, describe, expect, test } from "vitest";
import { getCV, loadOpenCV, type Mat } from "../core/cv";
import {
	type AtlasMeta,
	type GlyphSet,
	loadGlyphSet,
	recognizeTextSteps,
	scaleGlyphSet,
} from "../core/glyphs";
import type { FrameData } from "../core/image";
import { runSync } from "../core/match-steps";

/** `#` ink, `+` soft edge (kept by the template crop, so a bar is not one flat block), `.` nothing */
const SHAPES = {
	stems: [
		"##....##",
		"##....##",
		"##....##",
		"##....##",
		"##....##",
		"########",
		"########",
		"##....##",
		"##....##",
		"##....##",
		"##....##",
		"##....##",
	],
	ring: [
		".######.",
		"##....##",
		"##....##",
		"##....##",
		"##....##",
		"##....##",
		"##....##",
		".######.",
	],
	bowl: [
		"#######.",
		"##....##",
		"##....##",
		"##....##",
		"#######.",
		"##......",
		"##......",
		"##......",
		"##......",
		"##......",
		"##......",
		"##......",
	],
	bar: ["+######+", "########", "+######+"],
} as const;

/** The characters of the drawn font: a shape and how far under the baseline its box ends. */
const FONT: Record<string, { shape: keyof typeof SHAPES; descent: number }> = {
	H: { shape: "stems", descent: 0 },
	o: { shape: "ring", descent: 0 },
	P: { shape: "bowl", descent: 0 },
	p: { shape: "bowl", descent: 4 },
	_: { shape: "bar", descent: 0 },
	"-": { shape: "bar", descent: -5 },
};

const GLYPH_WIDTH = 8;
const GLYPH_GAP = 3;
const CAP_HEIGHT = 12;

let set: GlyphSet;

beforeAll(async () => {
	await loadOpenCV();
	set = loadGlyphSet(...atlas(Object.keys(FONT)));
});

describe("recognizeTextSteps", () => {
	test.each([
		{ why: "a bowl ending on the baseline", text: "HoHP" },
		{ why: "the same bowl hanging under it", text: "HoHp" },
		{ why: "a bar on the baseline", text: "Ho_H" },
		{ why: "the same bar at mid height", text: "Ho-H" },
		{ why: "twins of both heights on one line", text: "PpoP-_p" },
	])("reads $why by its place on the line ($text)", ({ text }) => {
		expect(read(line(text), set)).toBe(text);
	});

	test("keeps glyphs to their height along a tilted line", () => {
		const text = "HoPopoHoPop";
		expect(read(line(text, { tilt: 0.03 }), set)).toBe(text);
	});

	test("reads a line drawn smaller than its templates", () => {
		const text = "HoPopo_H-p";
		const drawn = line(text, { scale: 1.8 });
		expect(read(drawn, scaleGlyphSet(set, 2))).toBe(text);
	});

	test("leaves a border line of the crop out of the read", () => {
		const text = "HoHp";
		const withBorder = line(text);
		const border = withBorder.roi(new (getCV().Rect)(0, 0, withBorder.cols, 1));
		border.setTo(new (getCV().Scalar)(255));
		border.delete();
		expect(read(withBorder, set)).toBe(text);
	});
});

describe("loadGlyphSet", () => {
	test("refuses an atlas whose glyphs have no baseline", () => {
		const [image, meta] = atlas(["H", "o"]);
		const bare: AtlasMeta = {
			...meta,
			glyphs: meta.glyphs.map(({ baseline: _, ...glyph }) => glyph),
		};
		expect(() => loadGlyphSet(image, bare)).toThrow(/baseline/);
	});
});

function read(gray: Mat, glyphs: GlyphSet): string {
	const { text } = runSync(recognizeTextSteps(gray, glyphs));
	gray.delete();
	return text;
}

/** One box per character with a pixel of margin, baselines as the font has them. */
function atlas(chars: string[]): [FrameData, AtlasMeta] {
	const pad = 1;
	const width = chars.length * (GLYPH_WIDTH + 2 * pad);
	const height = CAP_HEIGHT + 2 * pad;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 3; i < data.length; i += 4) data[i] = 255;
	const meta: AtlasMeta = { height: CAP_HEIGHT, glyphs: [] };
	for (const [i, char] of chars.entries()) {
		const { shape, descent } = FONT[char]!;
		const rows = SHAPES[shape];
		const x = i * (GLYPH_WIDTH + 2 * pad);
		for (const [y, row] of rows.entries()) {
			for (const [dx, pixel] of [...row].entries()) {
				const offset = ((pad + y) * width + x + pad + dx) * 4;
				data.fill(inkOf(pixel), offset, offset + 3);
			}
		}
		meta.glyphs.push({
			char,
			x,
			y: 0,
			w: GLYPH_WIDTH + 2 * pad,
			h: rows.length + 2 * pad,
			source: "font",
			baseline: pad + rows.length - descent,
		});
	}
	return [{ width, height, data }, meta];
}

/** A grayscale crop with `text` drawn on one baseline, each pixel `scale` wide and tall. */
function line(text: string, { tilt = 0, scale = 1 } = {}): Mat {
	const cv = getCV();
	const margin = 6;
	const baseline = margin + CAP_HEIGHT + 4;
	const cols = 2 * margin + text.length * (GLYPH_WIDTH + GLYPH_GAP);
	const rows = baseline + 12;
	const small = new Uint8Array(cols * rows);
	for (const [i, char] of [...text].entries()) {
		const { shape, descent } = FONT[char]!;
		const glyphRows = SHAPES[shape];
		const x = margin + i * (GLYPH_WIDTH + GLYPH_GAP);
		const bottom =
			baseline + descent + Math.round(tilt * (x + GLYPH_WIDTH / 2));
		for (const [y, row] of glyphRows.entries()) {
			for (const [dx, pixel] of [...row].entries()) {
				small[(bottom - glyphRows.length + y) * cols + x + dx] = inkOf(pixel);
			}
		}
	}
	const width = Math.round(cols * scale);
	const height = Math.round(rows * scale);
	const gray = new cv.Mat(height, width, cv.CV_8UC1);
	const pixels = gray.data;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			pixels[y * width + x] =
				small[Math.floor(y / scale) * cols + Math.floor(x / scale)]!;
		}
	}
	return gray;
}

function inkOf(pixel: string): number {
	return pixel === "#" ? 255 : pixel === "+" ? 170 : 0;
}
