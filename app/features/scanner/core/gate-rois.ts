/**
 * The pixels the gates read (`Detector.gateRois`), as one list of row spans
 * of the canonical frame. A VoD scan reads only these back for a frame it
 * expects every gate to fail on (worker/gpu-gather.ts packs them on the GPU)
 * and lays them out again as a canonical frame here, the rest of it left
 * black.
 */
import { CANONICAL_HEIGHT, CANONICAL_WIDTH, type Roi } from "./canonical";
import type { Image } from "./image";

/** Every gate ROI pixel once: `[y, x, length]` per span, in row order. */
export type GateSpans = Int32Array;

/**
 * The union of `rois` (clipped to the canonical frame) as row spans, each
 * pixel once, in row order.
 */
export function spansOf(rois: readonly Roi[]): GateSpans {
	const covered = new Uint8Array(CANONICAL_WIDTH * CANONICAL_HEIGHT);
	for (const roi of rois) {
		const left = Math.max(0, roi.x);
		const right = Math.min(CANONICAL_WIDTH, roi.x + roi.w);
		for (
			let y = Math.max(0, roi.y);
			y < Math.min(CANONICAL_HEIGHT, roi.y + roi.h);
			y++
		) {
			if (right > left) {
				covered.fill(
					1,
					y * CANONICAL_WIDTH + left,
					y * CANONICAL_WIDTH + right,
				);
			}
		}
	}
	const spans: number[] = [];
	for (let y = 0; y < CANONICAL_HEIGHT; y++) {
		const row = y * CANONICAL_WIDTH;
		let x = 0;
		while (x < CANONICAL_WIDTH) {
			if (covered[row + x] === 0) {
				x++;
				continue;
			}
			const start = x;
			while (x < CANONICAL_WIDTH && covered[row + x] === 1) x++;
			spans.push(y, start, x - start);
		}
	}
	return Int32Array.from(spans);
}

/** Pixels `spans` cover. */
export function pixelCount(spans: GateSpans): number {
	let count = 0;
	for (let i = 2; i < spans.length; i += 3) count += spans[i]!;
	return count;
}

/**
 * The pixels of `frame` (canonical) under `spans`, packed in span order; what the GPU gather reads back.
 * @internal
 */
export function gather(spans: GateSpans, frame: Image): Uint8Array {
	const { channels } = frame;
	const packed = new Uint8Array(pixelCount(spans) * channels);
	let offset = 0;
	for (let i = 0; i < spans.length; i += 3) {
		const start = (spans[i]! * CANONICAL_WIDTH + spans[i + 1]!) * channels;
		const length = spans[i + 2]! * channels;
		packed.set(frame.data.subarray(start, start + length), offset);
		offset += length;
	}
	return packed;
}

/** Writes `packed` (gather's layout) back under `spans` of `target` (canonical, same channel count); the rest of `target` is left as it is. */
export function scatter(
	spans: GateSpans,
	packed: Uint8Array,
	target: Image,
): void {
	const { channels } = target;
	let offset = 0;
	for (let i = 0; i < spans.length; i += 3) {
		const start = (spans[i]! * CANONICAL_WIDTH + spans[i + 1]!) * channels;
		const length = spans[i + 2]! * channels;
		target.data.set(packed.subarray(offset, offset + length), start);
		offset += length;
	}
}
