/**
 * Frame readback: a decoded frame's pixels as RGBA. The reference is a 2D
 * canvas (drawImage + getImageData), the path live frames take. The canvas
 * blocks its thread for the whole GPU → CPU conversion (3-5 ms a frame), so
 * the VoD scan reads frames in helper workers (readback.worker.ts) while the
 * analyzer runs detectors on the previous one.
 *
 * Every canvas readback is also served one at a time on the GPU process's
 * main thread, which the hardware decoder needs too: with four lanes reading
 * back, that thread was the scan's ceiling. The VoD scan therefore reads
 * through WebGPU instead where it gives the same pixels (readback-parity.ts
 * checks per scan): the frame's planes are copied out to a CPU frame —
 * which, unlike a hardware frame, WebGPU converts exactly as the canvas
 * converts the hardware one — then uploaded, converted and mapped back
 * asynchronously, with no GPU-process round trip to wait on.
 */
import {
	CANONICAL_HEIGHT,
	CANONICAL_WIDTH,
	detectContentBox,
} from "../core/canonical";
import type { FrameData } from "../core/image";
import {
	type CubicUpscaler,
	createCubicUpscaler,
	upscalesCubic,
} from "./cubic-upscaler";
import { createGrayKernel, type GrayKernel } from "./gpu-gray";

const TEXTURE_COPY_SRC = 0x01;
const TEXTURE_COPY_DST = 0x02;
const TEXTURE_RENDER_ATTACHMENT = 0x10;
const BUFFER_MAP_READ = 0x0001;
const BUFFER_COPY_SRC = 0x0004;
const BUFFER_COPY_DST = 0x0008;
const BUFFER_STORAGE = 0x0080;
const MAP_MODE_READ = 0x0001;
/** WebGPU texture-to-buffer copies pad each row to this many bytes */
const ROW_ALIGNMENT = 256;

export type ReadbackPath = "canvas" | "webgpu";

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

/**
 * A read-back frame, plus what the GPU computes while it holds the pixels:
 * the canonical picture when normalizeFrame would upscale it, and the
 * canonical picture's gray (frameGray) when it has no bars to crop.
 */
export interface ReadFrame extends FrameData {
	canonical?: Uint8Array;
	gray?: Uint8Array;
}

/** Reads frames back through WebGPU (see the module header); closes `frame`. Rejects when WebGPU is unavailable. */
export function createWebGpuReadback(): (
	frame: VideoFrame,
	options?: { upscale?: boolean },
) => Promise<ReadFrame> {
	let device: Promise<{
		gpu: GPUDevice;
		upscaler: CubicUpscaler;
		grayKernel: GrayKernel;
	}> | null = null;
	/** per frame size: a texture, and buffer pairs not in use */
	const targets = new Map<
		string,
		{ texture: GPUTexture; buffers: { pixels: GPUBuffer; map: GPUBuffer }[] }
	>();
	const getDevice = () => {
		if (!device) {
			const created = (async () => {
				const adapter = await navigator.gpu?.requestAdapter();
				if (!adapter) throw new Error("WebGPU unavailable");
				const gpu = await adapter.requestDevice();
				void gpu.lost.then(() => {
					device = null;
					targets.clear();
				});
				return {
					gpu,
					upscaler: await createCubicUpscaler(gpu),
					grayKernel: await createGrayKernel(gpu),
				};
			})();
			created.catch(() => {
				device = null;
			});
			device = created;
		}
		return device;
	};
	return async (frame, { upscale = true } = {}) => {
		const width = frame.displayWidth;
		const height = frame.displayHeight;
		try {
			const [{ gpu, upscaler, grayKernel }, planes] = await Promise.all([
				getDevice(),
				cpuCopy(frame),
			]);
			const key = `${width}x${height}`;
			let target = targets.get(key);
			if (!target) {
				target = {
					texture: gpu.createTexture({
						size: [width, height],
						format: "rgba8unorm",
						usage:
							TEXTURE_COPY_SRC | TEXTURE_COPY_DST | TEXTURE_RENDER_ATTACHMENT,
					}),
					buffers: [],
				};
				targets.set(key, target);
			}
			const bytesPerRow =
				Math.ceil((width * 4) / ROW_ALIGNMENT) * ROW_ALIGNMENT;
			const buffers = target.buffers.pop() ?? {
				pixels: gpu.createBuffer({
					size: bytesPerRow * height,
					usage: BUFFER_STORAGE | BUFFER_COPY_SRC | BUFFER_COPY_DST,
				}),
				map: gpu.createBuffer({
					size: bytesPerRow * height,
					usage: BUFFER_MAP_READ | BUFFER_COPY_DST,
				}),
			};
			try {
				gpu.queue.copyExternalImageToTexture(
					{ source: planes },
					{ texture: target.texture },
					[width, height],
				);
			} finally {
				planes.close();
			}
			// a picture without bars is upscaled in the same submission, as it
			// most likely is; one with bars takes a second round trip
			const fullFrame = { x: 0, y: 0, w: width, h: height };
			const stride = bytesPerRow / 4;
			gpu.pushErrorScope("validation");
			const encoder = gpu.createCommandEncoder();
			encoder.copyTextureToBuffer(
				{ texture: target.texture },
				{ buffer: buffers.pixels, bytesPerRow },
				[width, height],
			);
			encoder.copyBufferToBuffer(
				buffers.pixels,
				0,
				buffers.map,
				0,
				bytesPerRow * height,
			);
			const speculative =
				upscale && upscalesCubic(width, height)
					? upscaler.encode(encoder, {
							buffer: buffers.pixels,
							stride,
							box: fullFrame,
						})
					: null;
			const canonicalSource = speculative
				? { buffer: speculative.canonical, stride: CANONICAL_WIDTH }
				: width === CANONICAL_WIDTH && height === CANONICAL_HEIGHT
					? { buffer: buffers.pixels, stride }
					: null;
			const grayRead = canonicalSource
				? grayKernel.encode(
						encoder,
						canonicalSource.buffer,
						canonicalSource.stride,
					)
				: null;
			gpu.queue.submit([encoder.finish()]);
			const [submitError, , upscaled, gray] = await Promise.all([
				gpu.popErrorScope(),
				buffers.map.mapAsync(MAP_MODE_READ),
				speculative
					? mapCopy(speculative.read, () => upscaler.release(speculative.read))
					: null,
				grayRead ? mapCopy(grayRead, () => grayKernel.release(grayRead)) : null,
			]);
			if (submitError) throw new Error(`readback: ${submitError.message}`);
			const mapped = new Uint8Array(buffers.map.getMappedRange());
			const data = new Uint8ClampedArray(width * height * 4);
			if (bytesPerRow === width * 4) data.set(mapped);
			else {
				for (let y = 0; y < height; y++) {
					data.set(
						mapped.subarray(y * bytesPerRow, y * bytesPerRow + width * 4),
						y * width * 4,
					);
				}
			}
			buffers.map.unmap();
			const box = detectContentBox(width, height, data);
			let canonical: Uint8Array | undefined;
			if (!box) canonical = upscaled ?? undefined;
			else if (upscale && upscalesCubic(box.w, box.h)) {
				canonical = await upscaler.upscale({
					buffer: buffers.pixels,
					stride,
					box,
				});
			}
			target.buffers.push(buffers);
			// the gray is of the picture as it stands: only right without bars
			return {
				width,
				height,
				data,
				canonical,
				gray: box ? undefined : (gray ?? undefined),
			};
		} finally {
			frame.close();
		}
	};
}

export interface ReadbackRequest {
	id: number;
	frame: VideoFrame;
	path: ReadbackPath;
	upscale: boolean;
}

export type ReadbackResponse =
	| ({ id: number } & ReadFrame)
	| { id: number; error: string };

export interface ReadOptions {
	path?: ReadbackPath;
	/** also return the canonical picture when the WebGPU path would upscale it (default true) */
	upscale?: boolean;
}

export interface FrameReader {
	/** RGBA of `frame`, read off this thread when possible; takes ownership of `frame`. */
	read(frame: VideoFrame, options?: ReadOptions): Promise<ReadFrame>;
	dispose(): void;
}

/** `count` FrameReaders as one, each read going to the one with the fewest reads in flight. */
export function createFrameReaderPool(count: number): FrameReader {
	const readers = Array.from({ length: count }, () => ({
		reader: createFrameReader(),
		inFlight: 0,
	}));
	return {
		read(frame, options) {
			const target = readers.reduce((best, candidate) =>
				candidate.inFlight < best.inFlight ? candidate : best,
			);
			target.inFlight++;
			return target.reader.read(frame, options).finally(() => {
				target.inFlight--;
			});
		},
		dispose() {
			for (const { reader } of readers) reader.dispose();
		},
	};
}

/** A mapped copy of `read`'s contents; `done` runs once it is unmapped (or failed). */
async function mapCopy(read: GPUBuffer, done: () => void): Promise<Uint8Array> {
	try {
		await read.mapAsync(MAP_MODE_READ);
		const copy = new Uint8Array(read.getMappedRange().slice(0));
		read.unmap();
		return copy;
	} finally {
		done();
	}
}

/** A FrameReader backed by readback.worker.ts; reads on the calling thread if the worker cannot run. */
function createFrameReader(): FrameReader {
	const local = {
		canvas: createCanvasReadback(),
		webgpu: createWebGpuReadback(),
	};
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
			options: Required<ReadOptions>;
			resolve: (data: ReadFrame) => void;
			reject: (error: unknown) => void;
		}
	>();
	const readLocally = (
		frame: VideoFrame,
		{ path, upscale }: Required<ReadOptions>,
	) => {
		try {
			return path === "webgpu"
				? local.webgpu(frame, { upscale })
				: Promise.resolve(local.canvas(frame));
		} catch (error) {
			return Promise.reject(error);
		}
	};
	// a broken worker hands its in-flight frames back to this thread
	const abandonWorker = () => {
		worker?.terminate();
		worker = null;
		for (const { backup, options, resolve, reject } of pending.values()) {
			readLocally(backup, options).then(resolve, reject);
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
				readLocally(waiter.backup, waiter.options).then(
					waiter.resolve,
					waiter.reject,
				);
				return;
			}
			waiter.backup.close();
			waiter.resolve(response);
		};
		worker.onerror = abandonWorker;
	}
	return {
		read(frame, { path = "canvas", upscale = true } = {}) {
			const options = { path, upscale };
			if (!worker) return readLocally(frame, options);
			const id = nextId++;
			const result = new Promise<ReadFrame>((resolve, reject) => {
				pending.set(id, { backup: frame.clone(), options, resolve, reject });
			});
			worker.postMessage({ id, frame, ...options } satisfies ReadbackRequest, {
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

/** The frame's planes as a CPU-backed frame (the caller closes both). */
async function cpuCopy(frame: VideoFrame): Promise<VideoFrame> {
	if (!frame.format || !frame.visibleRect) {
		throw new Error("frame pixels are opaque");
	}
	const buffer = new Uint8Array(frame.allocationSize());
	const layout = await frame.copyTo(buffer);
	return new VideoFrame(buffer, {
		format: frame.format,
		codedWidth: frame.visibleRect.width,
		codedHeight: frame.visibleRect.height,
		layout,
		timestamp: frame.timestamp,
		colorSpace: frame.colorSpace.toJSON(),
		displayWidth: frame.displayWidth,
		displayHeight: frame.displayHeight,
	});
}
