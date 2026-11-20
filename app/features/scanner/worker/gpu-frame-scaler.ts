/**
 * normalizeFrame (core/image.ts) with its INTER_CUBIC upscale on the GPU —
 * the costliest per-frame step for sub-1080p sources (~13-25 ms of WASM per
 * 720p frame) — through the exact kernel of cubic-upscaler.ts; frames it
 * does not cover (exact 1080p copies, INTER_AREA downscales) run the CPU
 * path unchanged.
 */
import {
	CANONICAL_HEIGHT,
	CANONICAL_WIDTH,
	detectContentBox,
} from "../core/canonical";
import { type Image, normalizeFrame } from "../core/image";
import { createCubicUpscaler, upscalesCubic } from "./cubic-upscaler";

const BUFFER_COPY_DST = 0x0008;
const BUFFER_STORAGE = 0x0080;

export interface GpuFrameScaler {
	/** normalizeFrame, with sub-canonical pictures upscaled on the GPU; a failed dispatch falls back to the CPU. */
	normalize(src: Image): Promise<Image>;
}

export async function createGpuFrameScaler(
	device: GPUDevice,
): Promise<GpuFrameScaler> {
	const upscaler = await createCubicUpscaler(device);
	let srcBuffer: GPUBuffer | null = null;
	let failed = false;

	async function normalize(src: Image): Promise<Image> {
		if (failed) return normalizeFrame(src);
		const box = detectContentBox(src.cols, src.rows, src.data);
		const x = box?.x ?? 0;
		const y = box?.y ?? 0;
		const w = box?.w ?? src.cols;
		const h = box?.h ?? src.rows;
		// exact-size copies and INTER_AREA downscales stay on the CPU
		if (!upscalesCubic(w, h)) return normalizeFrame(src);
		try {
			const srcData = src.data;
			if (!srcBuffer || srcBuffer.size < srcData.byteLength) {
				srcBuffer?.destroy();
				srcBuffer = device.createBuffer({
					size: srcData.byteLength,
					usage: BUFFER_STORAGE | BUFFER_COPY_DST,
				});
			}
			device.queue.writeBuffer(srcBuffer, 0, srcData);
			const pixels = await upscaler.upscale({
				buffer: srcBuffer,
				stride: src.cols,
				box: { x, y, w, h },
			});
			return {
				rows: CANONICAL_HEIGHT,
				cols: CANONICAL_WIDTH,
				channels: 4,
				data: pixels,
			};
		} catch {
			failed = true;
			return normalizeFrame(src);
		}
	}

	return { normalize };
}
