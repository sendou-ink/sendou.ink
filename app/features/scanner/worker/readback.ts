/**
 * Frame readback: a decoded frame's pixels as RGBA through a 2D canvas
 * (drawImage + getImageData), the one path every analyzed frame takes so the
 * pixels never depend on where it ran. The canvas blocks its thread for the
 * whole GPU → CPU conversion (3-5 ms a frame), so the VoD scan reads frames
 * in a helper worker (readback.worker.ts) while the analyzer runs detectors
 * on the previous one.
 */
import type { FrameData } from "../core/image";

/** Reads a frame back to RGBA on the calling thread, reusing one canvas; closes `bitmap`. */
export function createCanvasReadback(): (
	bitmap: ImageBitmap | VideoFrame,
) => FrameData {
	let canvas: OffscreenCanvas | null = null;
	let ctx: OffscreenCanvasRenderingContext2D | null = null;
	return (bitmap) => {
		const width = "displayWidth" in bitmap ? bitmap.displayWidth : bitmap.width;
		const height =
			"displayHeight" in bitmap ? bitmap.displayHeight : bitmap.height;
		if (!canvas || !ctx || canvas.width !== width || canvas.height !== height) {
			canvas = new OffscreenCanvas(width, height);
			ctx = canvas.getContext("2d", { willReadFrequently: true })!;
		}
		ctx.drawImage(bitmap, 0, 0);
		bitmap.close();
		const { data } = ctx.getImageData(0, 0, width, height);
		return { width, height, data };
	};
}

export interface ReadbackRequest {
	id: number;
	frame: VideoFrame;
}

export type ReadbackResponse =
	| { id: number; width: number; height: number; data: Uint8ClampedArray }
	| { id: number; error: string };

export interface FrameReader {
	/** RGBA of `frame`, read off this thread when possible; takes ownership of `frame`. */
	read(frame: VideoFrame): Promise<FrameData>;
	dispose(): void;
}

/** A FrameReader backed by readback.worker.ts; reads on the calling thread if the worker cannot run. */
export function createFrameReader(
	readHere: (bitmap: VideoFrame) => FrameData,
): FrameReader {
	let worker: Worker | null = null;
	try {
		worker = new Worker(new URL("./readback.worker.ts", import.meta.url), {
			type: "module",
		});
	} catch {
		worker = null;
	}
	let nextId = 0;
	/** in-flight reads, each holding a clone of its frame until answered */
	const pending = new Map<
		number,
		{
			backup: VideoFrame;
			resolve: (data: FrameData) => void;
			reject: (error: unknown) => void;
		}
	>();
	const readLocally = (frame: VideoFrame) => {
		try {
			return Promise.resolve(readHere(frame));
		} catch (error) {
			return Promise.reject(error);
		}
	};
	// a broken worker hands its in-flight frames back to this thread
	const abandonWorker = () => {
		worker?.terminate();
		worker = null;
		for (const { backup, resolve, reject } of pending.values()) {
			readLocally(backup).then(resolve, reject);
		}
		pending.clear();
	};
	if (worker) {
		worker.onmessage = (e: MessageEvent<ReadbackResponse>) => {
			const response = e.data;
			const waiter = pending.get(response.id);
			if (!waiter) return;
			pending.delete(response.id);
			if ("error" in response) {
				readLocally(waiter.backup).then(waiter.resolve, waiter.reject);
				return;
			}
			waiter.backup.close();
			waiter.resolve(response);
		};
		worker.onerror = abandonWorker;
	}
	return {
		read(frame) {
			if (!worker) return readLocally(frame);
			const id = nextId++;
			const result = new Promise<FrameData>((resolve, reject) => {
				pending.set(id, { backup: frame.clone(), resolve, reject });
			});
			worker.postMessage({ id, frame } satisfies ReadbackRequest, {
				transfer: [frame],
			});
			return result;
		},
		dispose() {
			worker?.terminate();
			worker = null;
			for (const { backup, reject } of pending.values()) {
				backup.close();
				reject(new Error("frame reader disposed"));
			}
			pending.clear();
		},
	};
}
