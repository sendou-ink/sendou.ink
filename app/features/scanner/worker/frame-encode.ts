/**
 * Lossless WebP of read-back pixels (half a PNG's size, exact pixels), the
 * frame a misread is reported and made into a fixture with. The encode runs
 * synchronously on its thread (~30 ms at 1080p), so the analyzer hands it to
 * frame-encode.worker.ts and carries on with the next frame.
 */
import type { FrameData } from "../core/image";

/** Encodes on the calling thread. Browsers without a WebP encoder fall back to PNG. */
export function encodeFrame({ width, height, data }: FrameData): Promise<Blob> {
	const canvas = new OffscreenCanvas(width, height);
	canvas
		.getContext("2d")!
		.putImageData(
			new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height),
			0,
			0,
		);
	return canvas.convertToBlob({ type: "image/webp", quality: 1 });
}

export interface EncodeRequest {
	id: number;
	pixels: FrameData;
}

export type EncodeResponse =
	| { id: number; blob: Blob }
	| { id: number; error: string };

/** Encodes in frame-encode.worker.ts, or on the calling thread if the worker cannot run; takes ownership of `pixels`. */
export function createFrameEncoder(): (pixels: FrameData) => Promise<Blob> {
	let worker: Worker | null = null;
	try {
		worker = new Worker(new URL("./frame-encode.worker.ts", import.meta.url), {
			type: "module",
		});
	} catch {
		worker = null;
	}
	let nextId = 0;
	const pending = new Map<
		number,
		{ resolve: (blob: Blob) => void; reject: (error: Error) => void }
	>();
	if (worker) {
		worker.onmessage = (e: MessageEvent<EncodeResponse>) => {
			const response = e.data;
			const waiter = pending.get(response.id);
			if (!waiter) return;
			pending.delete(response.id);
			if ("error" in response) waiter.reject(new Error(response.error));
			else waiter.resolve(response.blob);
		};
		worker.onerror = () => {
			worker?.terminate();
			worker = null;
			for (const { reject } of pending.values()) {
				reject(new Error("frame encoder failed"));
			}
			pending.clear();
		};
	}
	return (pixels) => {
		if (!worker) return encodeFrame(pixels);
		const id = nextId++;
		const result = new Promise<Blob>((resolve, reject) => {
			pending.set(id, { resolve, reject });
		});
		worker.postMessage({ id, pixels } satisfies EncodeRequest, {
			transfer: [pixels.data.buffer],
		});
		return result;
	};
}
