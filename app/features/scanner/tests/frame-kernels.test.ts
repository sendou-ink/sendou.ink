/**
 * Exactness of the scanner's replacements for OpenCV frame operations: each
 * must reproduce OpenCV's output bit for bit on the same input.
 */
import { describe, expect, test } from "vitest";
import { unionRoi } from "../core/canonical";
import { getCV, loadOpenCV, type Mat } from "../core/cv";
import { ROIS as QUICK_BATTLE_LOG_ROIS } from "../core/detectors/quick-scoreboard-battle-log/rois";
import { frameKernels } from "../core/frame-kernels";
import { createProbeWarp, warpPerspective } from "../core/image";
import { homographyFromQuad } from "../core/rectify";

await loadOpenCV();

describe("createProbeWarp", () => {
	const homography = homographyFromQuad(QUICK_BATTLE_LOG_ROIS.RECTIFY!);
	const probes = [
		...QUICK_BATTLE_LOG_ROIS.PANEL_DYS.flatMap((dy) =>
			QUICK_BATTLE_LOG_ROIS.ROW_CENTERS.flatMap((base) => [
				QUICK_BATTLE_LOG_ROIS.gateDarkProbe(base + dy),
				QUICK_BATTLE_LOG_ROIS.paintSuffixRoi(base + dy),
			]),
		),
		...QUICK_BATTLE_LOG_ROIS.GATE_COLOR_PROBES,
	];
	const region = unionRoi(probes);
	// the whole region as one probe, so every pixel of it is compared
	const warp = createProbeWarp(homography, region, [
		{ x: 0, y: 0, w: region.w, h: region.h },
	]);

	test.each([1, 2, 3])(
		"matches warpPerspective on every pixel of a noise frame (seed %i)",
		(seed) => {
			const frame = noiseFrame(seed);
			const expected = warpPerspective(frame, homography, region);
			const actual = warp(frame);
			expect(Buffer.compare(actual.data, expected.data)).toBe(0);
			for (const mat of [frame, expected, actual]) mat.delete();
		},
	);

	test("leaves pixels outside the probes at zero", () => {
		const frame = noiseFrame(4);
		const probe = { x: 3, y: 5, w: 2, h: 1 };
		const actual = createProbeWarp(homography, region, [probe])(frame);
		const data = actual.data as Uint8Array;
		const written = new Set([5 * region.w + 3, 5 * region.w + 4]);
		for (let pixel = 0; pixel < region.w * region.h; pixel++) {
			if (written.has(pixel)) continue;
			expect(data.subarray(pixel * 4, pixel * 4 + 4)).toEqual(
				new Uint8Array(4),
			);
		}
		frame.delete();
		actual.delete();
	});
});

describe("frameKernels", () => {
	const kernels = frameKernels();

	test("load on OpenCV's memory", () => {
		expect(kernels).not.toBeNull();
	});

	test("rgbaToGray matches cvtColor on every RGB value", () => {
		const cv = getCV();
		// 4096 x 4096 pixels: every 24-bit color once, alpha varied
		const src = new cv.Mat(4096, 4096, cv.CV_8UC4);
		const data = src.data as Uint8Array;
		for (let color = 0; color < 1 << 24; color++) {
			data[color * 4] = color & 255;
			data[color * 4 + 1] = (color >> 8) & 255;
			data[color * 4 + 2] = color >> 16;
			data[color * 4 + 3] = Math.imul(color, 7919) & 255;
		}
		expectSameAsCvtColor(src, "rgbaToGray", cv.COLOR_RGBA2GRAY);
		src.delete();
	});

	test.each([
		[1, 1],
		[1, 5],
		[3, 7],
		[2, 17],
		[37, 3],
		[1080, 1920],
	])("both match cvtColor on a %i x %i noise image", (rows, cols) => {
		const cv = getCV();
		const src = noiseMat(rows, cols, rows * 131 + cols);
		expectSameAsCvtColor(src, "rgbaToGray", cv.COLOR_RGBA2GRAY);
		expectSameAsCvtColor(src, "rgbaToRgb", cv.COLOR_RGBA2RGB);
		src.delete();
	});

	function expectSameAsCvtColor(
		src: Mat,
		kernel: "rgbaToGray" | "rgbaToRgb",
		code: number,
	) {
		const cv = getCV();
		const expected = new cv.Mat();
		cv.cvtColor(src, expected, code);
		const actual = kernels![kernel](src);
		expect(actual.type()).toBe(expected.type());
		expect(Buffer.compare(actual.data, expected.data)).toBe(0);
		expected.delete();
		actual.delete();
	}
});

/** A canonical RGBA frame of deterministic pseudo-random bytes. */
function noiseFrame(seed: number): Mat {
	return noiseMat(1080, 1920, seed);
}

function noiseMat(rows: number, cols: number, seed: number): Mat {
	const cv = getCV();
	const frame = new cv.Mat(rows, cols, cv.CV_8UC4);
	const data = frame.data as Uint8Array;
	let state = seed >>> 0;
	for (let i = 0; i < data.length; i++) {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		data[i] = state >>> 24;
	}
	return frame;
}
