import { type InputVideoTrack, VideoSampleSink } from "mediabunny";
import type { FrameReader, ReadbackPath } from "./readback";

/** The WebGPU readbacks, fastest first. */
const WEBGPU_PATHS: readonly ReadbackPath[] = [
	"webgpu-bitmap",
	"webgpu-planes",
];

/**
 * The fastest readback that reads the sample at `t` exactly as the canvas
 * reads its default decode, the pixels every analysis has always seen; the
 * canvas itself when none does. A flat picture proves nothing and a failing
 * decode or read rules a path out.
 */
export async function exactReadbackPath(
	track: InputVideoTrack,
	t: number,
	reader: FrameReader,
): Promise<ReadbackPath> {
	return (
		(await exactReadbackPathOf(track, t, reader, "no-preference")) ?? "canvas"
	);
}

/**
 * exactReadbackPath for the sample decoded with `hardwareAcceleration`, the
 * canvas included as a candidate; null when no path reads it as the canvas
 * reads the default decode.
 */
export async function exactReadbackPathOf(
	track: InputVideoTrack,
	t: number,
	reader: FrameReader,
	hardwareAcceleration: HardwareAcceleration,
): Promise<ReadbackPath | null> {
	const defaultDecode = hardwareAcceleration === "no-preference";
	const frame = await decodeAt(track, t, "no-preference");
	if (!frame) return null;
	const candidate = defaultDecode
		? frame
		: await decodeAt(track, t, hardwareAcceleration);
	try {
		if (!candidate) return null;
		const reference = await reader.read(frame.clone());
		if (isFlat(reference.data)) return null;
		const paths = defaultDecode
			? WEBGPU_PATHS
			: [...WEBGPU_PATHS, "canvas" as const];
		for (const path of paths) {
			const read = await reader
				.read(candidate.clone(), { path, normalize: false })
				.catch(() => null);
			if (read && sameBytes(reference.data, read.data)) return path;
		}
		return null;
	} catch {
		return null;
	} finally {
		frame.close();
		if (candidate !== frame) candidate?.close();
	}
}

async function decodeAt(
	track: InputVideoTrack,
	t: number,
	hardwareAcceleration: HardwareAcceleration,
): Promise<VideoFrame | null> {
	try {
		const sample = await new VideoSampleSink(track, {
			hardwareAcceleration,
		}).getSample(t);
		if (!sample) return null;
		const frame = sample.toVideoFrame();
		sample.close();
		return frame;
	} catch {
		return null;
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
