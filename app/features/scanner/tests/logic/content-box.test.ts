/**
 * Tests for the black-bar crop that precedes frame normalization: which
 * captures count as a bordered game picture, and which dark edges are the
 * game's own UI and must stay untouched.
 */

import assert from "node:assert/strict";
import { detectContentBox, type Roi } from "../../core/canonical";
import { test } from "../node-test-compat";

interface Band {
	rows?: (y: number) => number;
	cols?: (x: number) => number;
}

/** RGBA frame of `fill` grey with everything outside `picture` painted `barLevel`; `band` overrides per-row/column levels. */
function frame(
	width: number,
	height: number,
	picture: Roi | null,
	{
		fill = 120,
		barLevel = 0,
		band,
	}: { fill?: number; barLevel?: number; band?: Band } = {},
): Uint8ClampedArray {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const inside =
				picture !== null &&
				x >= picture.x &&
				x < picture.x + picture.w &&
				y >= picture.y &&
				y < picture.y + picture.h;
			let level = inside ? fill : barLevel;
			if (band?.rows && !inside) level = band.rows(y);
			if (band?.cols && !inside) level = band.cols(x);
			const i = (y * width + x) * 4;
			data[i] = level;
			data[i + 1] = level;
			data[i + 2] = level;
			data[i + 3] = 255;
		}
	}
	return data;
}

test("a bar-less frame is left alone", () => {
	assert.equal(
		detectContentBox(
			1920,
			1080,
			frame(1920, 1080, { x: 0, y: 0, w: 1920, h: 1080 }),
		),
		null,
	);
});

test("a picture drawn smaller than its 1920x1080 canvas is found inside the black frame", () => {
	const picture = { x: 28, y: 16, w: 1864, h: 1048 };
	assert.deepEqual(
		detectContentBox(1920, 1080, frame(1920, 1080, picture)),
		picture,
	);
});

test("a letterboxed 4:3 capture yields the 16:9 picture", () => {
	const picture = { x: 0, y: 135, w: 1440, h: 810 };
	assert.deepEqual(
		detectContentBox(1440, 1080, frame(1440, 1080, picture)),
		picture,
	);
});

test("video-range black bars count as bars", () => {
	const picture = { x: 28, y: 16, w: 1864, h: 1048 };
	assert.deepEqual(
		detectContentBox(1920, 1080, frame(1920, 1080, picture, { barLevel: 16 })),
		picture,
	);
});

test("a black screen is not cropped", () => {
	assert.equal(detectContentBox(1920, 1080, frame(1920, 1080, null)), null);
});

test("a shallow dark edge is UI, not a bar", () => {
	const picture = { x: 0, y: 5, w: 1920, h: 1075 };
	assert.equal(detectContentBox(1920, 1080, frame(1920, 1080, picture)), null);
});

test("a dark edge that breaks the 16:9 picture is scenery, not a bar", () => {
	const picture = { x: 0, y: 100, w: 1920, h: 980 };
	assert.equal(detectContentBox(1920, 1080, frame(1920, 1080, picture)), null);
});

test("a scanline-textured dark edge is not level enough to be a bar", () => {
	const picture = { x: 0, y: 12, w: 1920, h: 1068 };
	const scanlines = frame(1920, 1080, picture, {
		band: { rows: (y) => (y % 2 === 0 ? 1 : 12) },
	});
	assert.equal(detectContentBox(1920, 1080, scanlines), null);
});
