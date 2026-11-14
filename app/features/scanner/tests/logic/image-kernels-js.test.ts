import { describe, expect, test, vi } from "vitest";
import { frameKernels } from "../../core/frame-kernels";
import { IMAGE_KERNEL_CASES, imageKernelResult } from "../image-kernel-cases";

// the runtime without WebAssembly SIMD: every operation in its JS loops
vi.mock("../../core/frame-kernels", () => ({ frameKernels: () => null }));

describe("image operations without the WebAssembly kernels", () => {
	test("run without the kernels here", () => {
		expect(frameKernels()).toBeNull();
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
