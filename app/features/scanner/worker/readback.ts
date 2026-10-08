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
 * picks per scan): a hardware frame imported directly converts differently,
 * but an ImageBitmap of it is converted as the canvas converts it, on the
 * GPU ("webgpu-bitmap"); failing that, the frame's planes copied out to a
 * CPU frame are too, at the cost of two readbacks and an upload on the GPU
 * process's main thread ("webgpu-planes"). Either is then copied in, mapped
 * back asynchronously, with no GPU-process round trip to wait on.
 */
import {
	CANONICAL_HEIGHT,
	CANONICAL_WIDTH,
	detectContentBox,
	detectContentBoxFromSums,
} from "../core/canonical";
import type { FrameData } from "../core/image";
import {
	type AreaDownscaler,
	createAreaDownscaler,
	halvesArea,
} from "./area-downscaler";
import {
	type CubicUpscaler,
	createCubicUpscaler,
	upscalesCubic,
} from "./cubic-upscaler";
import { createGrayKernel, type GrayKernel } from "./gpu-gray";
import { createLineSumsKernel, type LineSumsKernel } from "./gpu-line-sums";

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

export type ReadbackPath = "canvas" | "webgpu-bitmap" | "webgpu-planes";

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
 * the canonical picture when normalizeFrame would resize it there, and the
 * canonical picture's gray (frameGray) when it has no bars to crop. A 2160p
 * picture without bars comes back as that canonical picture alone.
 */
export interface ReadFrame extends FrameData {
	canonical?: Uint8Array;
	gray?: Uint8Array;
}

/** Reads frames back through WebGPU (see the module header); closes `frame`. Rejects when WebGPU is unavailable. */
export function createWebGpuReadback(): (
	frame: VideoFrame,
	options: { source: "bitmap" | "planes"; normalize?: boolean },
) => Promise<ReadFrame> {
	let device: Promise<{
		gpu: GPUDevice;
		upscaler: CubicUpscaler;
		downscaler: AreaDownscaler;
		lineSums: LineSumsKernel;
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
					downscaler: await createAreaDownscaler(gpu),
					lineSums: await createLineSumsKernel(gpu),
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
	return async (frame, { source: from, normalize = true }) => {
		const width = frame.displayWidth;
		const height = frame.displayHeight;
		try {
			const [{ gpu, upscaler, downscaler, lineSums, grayKernel }, source] =
				await Promise.all([
					getDevice(),
					from === "bitmap" ? createImageBitmap(frame) : cpuCopy(frame),
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
					{ source },
					{ texture: target.texture },
					[width, height],
				);
			} finally {
				source.close();
			}
			// a picture without bars is resized in the same submission, as it
			// most likely is; one with bars takes a second round trip. A 2160p
			// picture maps only its downscale and line sums unless it has bars
			const fullFrame = { x: 0, y: 0, w: width, h: height };
			const stride = bytesPerRow / 4;
			const halves = normalize && halvesArea(width, height);
			gpu.pushErrorScope("validation");
			const encoder = gpu.createCommandEncoder();
			encoder.copyTextureToBuffer(
				{ texture: target.texture },
				{ buffer: buffers.pixels, bytesPerRow },
				[width, height],
			);
			if (!halves) copyToMap(encoder, buffers);
			const speculative = halves
				? {
						...downscaler.encode(encoder, buffers.pixels, stride),
						release: downscaler.release,
					}
				: normalize && upscalesCubic(width, height)
					? {
							...upscaler.encode(encoder, {
								buffer: buffers.pixels,
								stride,
								box: fullFrame,
							}),
							release: upscaler.release,
						}
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
			const lines = halves
				? lineSums.encode(encoder, buffers.pixels, {
						stride,
						w: width,
						h: height,
					})
				: null;
			gpu.queue.submit([encoder.finish()]);
			const [submitError, , scaled, gray, sums] = await Promise.all([
				gpu.popErrorScope(),
				halves ? null : buffers.map.mapAsync(MAP_MODE_READ),
				speculative
					? mapCopy(speculative.read, () =>
							speculative.release(speculative.read),
						)
					: null,
				grayRead ? mapCopy(grayRead, () => grayKernel.release(grayRead)) : null,
				lines?.read(),
			]);
			if (submitError) throw new Error(`readback: ${submitError.message}`);
			if (sums && scaled && !detectContentBoxFromSums(width, height, sums)) {
				target.buffers.push(buffers);
				return {
					width: CANONICAL_WIDTH,
					height: CANONICAL_HEIGHT,
					data: new Uint8ClampedArray(scaled.buffer),
					canonical: scaled,
					gray: gray ?? undefined,
				};
			}
			if (halves) {
				gpu.pushErrorScope("validation");
				const mapEncoder = gpu.createCommandEncoder();
				copyToMap(mapEncoder, buffers);
				gpu.queue.submit([mapEncoder.finish()]);
				const [mapError] = await Promise.all([
					gpu.popErrorScope(),
					buffers.map.mapAsync(MAP_MODE_READ),
				]);
				if (mapError) throw new Error(`readback: ${mapError.message}`);
			}
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
			if (!box) canonical = scaled ?? undefined;
			else if (normalize && upscalesCubic(box.w, box.h)) {
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

/** Reads `frame` back along `path` with a thread's readers; closes `frame`. */
export function readThrough(
	readers: {
		canvas: ReturnType<typeof createCanvasReadback>;
		webgpu: ReturnType<typeof createWebGpuReadback>;
	},
	frame: VideoFrame,
	{ path, normalize }: Required<ReadOptions>,
): Promise<ReadFrame> {
	if (path === "canvas") return Promise.resolve(readers.canvas(frame));
	return readers.webgpu(frame, {
		source: path === "webgpu-bitmap" ? "bitmap" : "planes",
		normalize,
	});
}

export interface ReadbackRequest {
	id: number;
	frame: VideoFrame;
	path: ReadbackPath;
	normalize: boolean;
}

export type ReadbackResponse =
	| ({ id: number } & ReadFrame)
	| { id: number; error: string };

export interface ReadOptions {
	path?: ReadbackPath;
	/** also return the canonical picture when the WebGPU path would resize it (default true) */
	normalize?: boolean;
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

function copyToMap(
	encoder: GPUCommandEncoder,
	{ pixels, map }: { pixels: GPUBuffer; map: GPUBuffer },
) {
	encoder.copyBufferToBuffer(pixels, 0, map, 0, pixels.size);
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
		{ path, normalize }: Required<ReadOptions>,
	) => {
		try {
			return readThrough(local, frame, { path, normalize });
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
		read(frame, { path = "canvas", normalize = true } = {}) {
			const options = { path, normalize };
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
