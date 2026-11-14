import { describe, expect, test } from "vitest";
import { ROIS as QUICK_BATTLE_LOG_ROIS } from "../../core/detectors/quick-scoreboard-battle-log/rois";
import { frameKernels } from "../../core/frame-kernels";
import { homographyFromQuad } from "../../core/rectify";
import { createProbeWarp, warpPerspective } from "../../core/warp";
import {
	IMAGE_KERNEL_CASES,
	imageKernelResult,
	noise,
	PROBE_REGION,
} from "../image-kernel-cases";

describe("image operations", () => {
	test("run on the WebAssembly kernels here", () => {
		expect(frameKernels()).not.toBeNull();
	});

	test.each(
		IMAGE_KERNEL_CASES.map(([spec, opencv]) => ({
			label: JSON.stringify(spec),
			spec,
			opencv,
		})),
	)("give OpenCV's output: $label", ({ spec, opencv }) => {
		expect(imageKernelResult(spec)).toBe(opencv);
	});
});

describe("createProbeWarp", () => {
	const homography = homographyFromQuad(QUICK_BATTLE_LOG_ROIS.RECTIFY!);

	test.each([1, 2, 3])(
		"matches warpPerspective on every pixel of a noise frame (seed %i)",
		(seed) => {
			const frame = noise(1080, 1920, 4, seed);
			// the whole region as one probe, so every pixel of it is compared
			const warp = createProbeWarp(homography, PROBE_REGION, [
				{ x: 0, y: 0, w: PROBE_REGION.w, h: PROBE_REGION.h },
			]);
			expect(warp(frame).data).toEqual(
				warpPerspective(frame, homography, PROBE_REGION).data,
			);
		},
	);

	test("leaves pixels outside the probes at zero", () => {
		const frame = noise(1080, 1920, 4, 4);
		const probe = { x: 3, y: 5, w: 2, h: 1 };
		const { data } = createProbeWarp(homography, PROBE_REGION, [probe])(frame);
		const written = new Set([5 * PROBE_REGION.w + 3, 5 * PROBE_REGION.w + 4]);
		for (let pixel = 0; pixel < PROBE_REGION.w * PROBE_REGION.h; pixel++) {
			if (written.has(pixel)) continue;
			expect(data.subarray(pixel * 4, pixel * 4 + 4)).toEqual(
				new Uint8Array(4),
			);
		}
	});
});
