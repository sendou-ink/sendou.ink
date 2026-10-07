import { type InputVideoTrack, VideoSampleSink } from "mediabunny";
import type { FrameReader, ReadbackPath } from "./readback";

/** The WebGPU readbacks, fastest first. */
const WEBGPU_PATHS: readonly ReadbackPath[] = [
	"webgpu-bitmap",
	"webgpu-planes",
];

/**
 * The fastest readback that reads the sample at `t` exactly as the canvas
 * does, the pixels every analysis has always seen; the canvas itself when
 * none does. A flat picture proves nothing and a failing decode or read
 * rules a path out.
 */
export async function exactReadbackPath(
	track: InputVideoTrack,
	t: number,
	reader: FrameReader,
): Promise<ReadbackPath> {
	let frame: VideoFrame;
	try {
		const sample = await new VideoSampleSink(track).getSample(t);
		if (!sample) return "canvas";
		frame = sample.toVideoFrame();
		sample.close();
	} catch {
		return "canvas";
	}
	try {
		const reference = await reader.read(frame.clone());
		if (isFlat(reference.data)) return "canvas";
		for (const path of WEBGPU_PATHS) {
			const read = await reader
				.read(frame.clone(), { path, upscale: false })
				.catch(() => null);
			if (read && sameBytes(reference.data, read.data)) return path;
		}
		return "canvas";
	} catch {
		return "canvas";
	} finally {
		frame.close();
	}
}

function isFlat(data: Uint8ClampedArray): boolean {
	for (let i = 4; i < data.length; i++) {
		if (data[i] !== data[i % 4]) return false;
	}
	return true;
}

function sameBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}
