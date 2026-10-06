import { type InputVideoTrack, VideoSampleSink } from "mediabunny";
import type { FrameReader } from "./readback";

/**
 * Whether the WebGPU readback reads the sample at `t` exactly as the canvas
 * does, the pixels every analysis has always seen. A flat picture proves
 * nothing and a failing decode or read rules the path out.
 */
export async function webGpuReadbackMatches(
	track: InputVideoTrack,
	t: number,
	reader: FrameReader,
): Promise<boolean> {
	let frame: VideoFrame;
	try {
		const sample = await new VideoSampleSink(track).getSample(t);
		if (!sample) return false;
		frame = sample.toVideoFrame();
		sample.close();
	} catch {
		return false;
	}
	const [reference, viaWebGpu] = await Promise.allSettled([
		reader.read(frame.clone()),
		reader.read(frame, { path: "webgpu", upscale: false }),
	]);
	return (
		reference.status === "fulfilled" &&
		viaWebGpu.status === "fulfilled" &&
		!isFlat(reference.value.data) &&
		sameBytes(reference.value.data, viaWebGpu.value.data)
	);
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
