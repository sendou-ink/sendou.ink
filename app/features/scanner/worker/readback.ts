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
 * back asynchronously, with no GPU-process round trip to wait on. A frame
 * the scan expects every gate to fail on maps back only the gate ROI pixels
 * (core/gate-rois.ts) and stays on the GPU until it is fetched whole or let go.
 */
import {
	CANONICAL_HEIGHT,
	CANONICAL_WIDTH,
	detectContentBox,
	detectContentBoxFromSums,
} from "../core/canonical";
import type * as GateRois from "../core/gate-rois";
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
import { createGatherKernel, type GatherKernel } from "./gpu-gather";
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
/** Gate-only reads a readback holds on the GPU at most (an analyzer reads a few frames ahead), the oldest let go past it. */
const MAX_HELD = 8;

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
	/** how long the read took on the thread that read it */
	readMs?: number;
}

/** A frame read back as the gate ROI pixels of its canonical picture only (core/gate-rois.ts), the rest held on the GPU. */
export interface GateRead {
	width: number;
	height: number;
	/** RGBA, in GateRois.gather's layout */
	gates: Uint8Array;
	readMs?: number;
}

export interface WebGpuReadback {
	/**
	 * `frame` read back; given `gates`, a picture without bars that the GPU
	 * makes canonical (1080p, or an INTER_CUBIC upscale) comes back as its gate
	 * pixels alone, `held` naming what `whole` or `release` takes next. Closes
	 * `frame`; rejects when WebGPU is unavailable.
	 */
	read(
		frame: VideoFrame,
		options: {
			source: "bitmap" | "planes";
			normalize?: boolean;
			gates?: GateRois.GateSpans | null;
		},
	): Promise<ReadFrame | (GateRead & { held: number })>;
	/** A held frame read back as a plain `read` would have: the canonical picture and its gray with it. */
	whole(held: number): Promise<ReadFrame>;
	/** Lets a held frame go unread. */
	release(held: number): void;
}

/** Reads frames back through WebGPU (see the module header). */
export function createWebGpuReadback(): WebGpuReadback {
	let device: Promise<GpuKernels> | null = null;
	/** per frame size: a texture, and buffers not in use */
	const targets = new Map<string, Target>();
	/** gate-only reads whose pixels stay on the GPU until whole or release */
	const held = new Map<number, HeldPixels>();
	let nextHeld = 0;
	let gatherCache: {
		spans: GateRois.GateSpans;
		kernel: Promise<GatherKernel>;
	} | null = null;
	const getDevice = () => {
		if (!device) {
			const created = (async () => {
				const adapter = await navigator.gpu?.requestAdapter();
				if (!adapter) throw new Error("WebGPU unavailable");
				const gpu = await adapter.requestDevice();
				void gpu.lost.then(() => {
					device = null;
					gatherCache = null;
					targets.clear();
					held.clear();
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
	const gatherKernel = (gpu: GPUDevice, spans: GateRois.GateSpans) => {
		if (gatherCache?.spans !== spans) {
			gatherCache = { spans, kernel: createGatherKernel(gpu, spans) };
		}
		return gatherCache.kernel;
	};
	const releaseHeld = (pixels: HeldPixels) => {
		pixels.target.pixels.push(pixels.pixels);
		if (pixels.upscaled) pixels.kernels.upscaler.release(pixels.upscaled.read);
	};

	return {
		async read(frame, { source: from, normalize = true, gates }) {
			const width = frame.displayWidth;
			const height = frame.displayHeight;
			try {
				const gateOnly =
					gates &&
					normalize &&
					((width === CANONICAL_WIDTH && height === CANONICAL_HEIGHT) ||
						upscalesCubic(width, height));
				const [kernels, source] = await Promise.all([
					getDevice(),
					from === "bitmap" ? createImageBitmap(frame) : cpuCopy(frame),
				]);
				const { gpu } = kernels;
				// awaited before the texture is written: from then on to the copy
				// out of it nothing may wait, or another read overwrites it
				// (a kernel that fails to build leaves every read whole)
				const gather = gateOnly
					? await gatherKernel(gpu, gates).catch(() => null)
					: null;
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
						pixels: [],
						maps: [],
					};
					targets.set(key, target);
				}
				const bytesPerRow =
					Math.ceil((width * 4) / ROW_ALIGNMENT) * ROW_ALIGNMENT;
				const picture: Picture = {
					width,
					height,
					bytesPerRow,
					stride: bytesPerRow / 4,
					target,
					pixels:
						target.pixels.pop() ??
						gpu.createBuffer({
							size: bytesPerRow * height,
							usage: BUFFER_STORAGE | BUFFER_COPY_SRC | BUFFER_COPY_DST,
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
				if (!gather) return await readWhole(kernels, picture, normalize);
				const gateRead = await readGates(kernels, gather, picture);
				if ("data" in gateRead) return gateRead;
				const id = nextHeld++;
				held.set(id, gateRead.held);
				// reads nobody comes back for must not pile up on the GPU
				for (const [oldest, pixels] of held) {
					if (held.size <= MAX_HELD) break;
					held.delete(oldest);
					releaseHeld(pixels);
				}
				return { width, height, gates: gateRead.gates, held: id };
			} finally {
				frame.close();
			}
		},
		async whole(id) {
			const pixels = held.get(id);
			if (!pixels) throw new Error("readback: the frame is no longer held");
			held.delete(id);
			return readHeldWhole(pixels);
		},
		release(id) {
			const pixels = held.get(id);
			if (!pixels) return;
			held.delete(id);
			releaseHeld(pixels);
		},
	};
}

/** Reads `frame` back along `path` with a thread's readers; closes `frame`. */
export function readThrough(
	readers: {
		canvas: ReturnType<typeof createCanvasReadback>;
		webgpu: WebGpuReadback;
	},
	frame: VideoFrame,
	{ path, normalize }: Required<ReadOptions>,
	gates: GateRois.GateSpans | null = null,
): Promise<ReadFrame | (GateRead & { held: number })> {
	const start = performance.now();
	const read =
		path === "canvas"
			? Promise.resolve(readers.canvas(frame))
			: readers.webgpu.read(frame, {
					source: path === "webgpu-bitmap" ? "bitmap" : "planes",
					normalize,
					gates,
				});
	return read.then((pixels) => ({
		...pixels,
		readMs: performance.now() - start,
	}));
}

export type ReadbackRequest =
	| {
			kind: "read";
			id: number;
			frame: VideoFrame;
			path: ReadbackPath;
			normalize: boolean;
			/** the gate pixels alone, where the picture allows it */
			gates: boolean;
	  }
	/** the gate ROIs every `gates` read packs from then on */
	| { kind: "gates"; spans: GateRois.GateSpans }
	| { kind: "whole"; id: number; held: number }
	| { kind: "release"; held: number };

export type ReadbackResponse =
	| ({ id: number } & ReadFrame)
	| ({ id: number; held: number } & GateRead)
	| { id: number; error: string };

export interface ReadOptions {
	path?: ReadbackPath;
	/** also return the canonical picture when the WebGPU path would resize it (default true) */
	normalize?: boolean;
}

/** A frame read back as its gate pixels (GateRead), the rest still to fetch or let go; one of the two must follow. */
export interface HeldFrame extends GateRead {
	/** the frame as `read` would have returned it */
	whole(): Promise<ReadFrame>;
	release(): void;
}

export interface FrameReader {
	/** RGBA of `frame`, read off this thread when possible; takes ownership of `frame`. */
	read(frame: VideoFrame, options?: ReadOptions): Promise<ReadFrame>;
	/** `read`, or the gate pixels of `spans` alone where the readback can hold the rest on the GPU. */
	readGates(
		frame: VideoFrame,
		spans: GateRois.GateSpans,
		options?: ReadOptions,
	): Promise<ReadFrame | HeldFrame>;
	dispose(): void;
}

/** `count` FrameReaders as one, each read going to the one with the fewest reads in flight. */
export function createFrameReaderPool(count: number): FrameReader {
	const readers = Array.from({ length: count }, () => ({
		reader: createFrameReader(),
		inFlight: 0,
	}));
	const leastBusy = () => {
		const target = readers.reduce((best, candidate) =>
			candidate.inFlight < best.inFlight ? candidate : best,
		);
		target.inFlight++;
		return target;
	};
	return {
		read(frame, options) {
			const target = leastBusy();
			return target.reader.read(frame, options).finally(() => {
				target.inFlight--;
			});
		},
		readGates(frame, spans, options) {
			const target = leastBusy();
			return target.reader.readGates(frame, spans, options).finally(() => {
				target.inFlight--;
			});
		},
		dispose() {
			for (const { reader } of readers) reader.dispose();
		},
	};
}

interface GpuKernels {
	gpu: GPUDevice;
	upscaler: CubicUpscaler;
	downscaler: AreaDownscaler;
	lineSums: LineSumsKernel;
	grayKernel: GrayKernel;
}

/** One frame size's texture and the buffers of reads not in flight. */
interface Target {
	texture: GPUTexture;
	pixels: GPUBuffer[];
	maps: GPUBuffer[];
}

/** A frame being read: its size and the storage buffer it is copied to. */
interface Picture {
	width: number;
	height: number;
	bytesPerRow: number;
	/** `bytesPerRow` in pixels */
	stride: number;
	target: Target;
	pixels: GPUBuffer;
}

/** A gate-only read's pixels on the GPU: the frame copied out, and its canonical upscale when it has one. */
interface HeldPixels extends Picture {
	kernels: GpuKernels;
	upscaled: { canonical: GPUBuffer; read: GPUBuffer } | null;
}

/**
 * The frame in `picture` read back whole, the canonical picture and its gray
 * with it where the GPU makes them. `copied`: its pixels are in the storage
 * buffer already (the texture may hold another frame by now).
 */
async function readWhole(
	{ gpu, upscaler, downscaler, lineSums, grayKernel }: GpuKernels,
	picture: Picture,
	normalize: boolean,
	copied = false,
): Promise<ReadFrame> {
	const { width, height, bytesPerRow, stride, target, pixels } = picture;
	const map = takeMap(gpu, target, pixels.size);
	// a picture without bars is resized in the same submission, as it
	// most likely is; one with bars takes a second round trip. A 2160p
	// picture maps only its downscale and line sums unless it has bars
	const fullFrame = { x: 0, y: 0, w: width, h: height };
	const halves = normalize && halvesArea(width, height);
	gpu.pushErrorScope("validation");
	const encoder = gpu.createCommandEncoder();
	if (!copied) {
		encoder.copyTextureToBuffer(
			{ texture: target.texture },
			{ buffer: pixels, bytesPerRow },
			[width, height],
		);
	}
	if (!halves) encoder.copyBufferToBuffer(pixels, 0, map, 0, pixels.size);
	const speculative = halves
		? {
				...downscaler.encode(encoder, pixels, stride),
				release: downscaler.release,
			}
		: normalize && upscalesCubic(width, height)
			? {
					...upscaler.encode(encoder, {
						buffer: pixels,
						stride,
						box: fullFrame,
					}),
					release: upscaler.release,
				}
			: null;
	const canonicalSource = speculative
		? { buffer: speculative.canonical, stride: CANONICAL_WIDTH }
		: width === CANONICAL_WIDTH && height === CANONICAL_HEIGHT
			? { buffer: pixels, stride }
			: null;
	const grayRead = canonicalSource
		? grayKernel.encode(encoder, canonicalSource.buffer, canonicalSource.stride)
		: null;
	const lines = halves
		? lineSums.encode(encoder, pixels, { stride, w: width, h: height })
		: null;
	gpu.queue.submit([encoder.finish()]);
	const [submitError, , scaled, gray, sums] = await Promise.all([
		gpu.popErrorScope(),
		halves ? null : map.mapAsync(MAP_MODE_READ),
		speculative
			? mapCopy(speculative.read, () => speculative.release(speculative.read))
			: null,
		grayRead ? mapCopy(grayRead, () => grayKernel.release(grayRead)) : null,
		lines?.read(),
	]);
	if (submitError) throw new Error(`readback: ${submitError.message}`);
	if (sums && scaled && !detectContentBoxFromSums(width, height, sums)) {
		target.pixels.push(pixels);
		target.maps.push(map);
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
		mapEncoder.copyBufferToBuffer(pixels, 0, map, 0, pixels.size);
		gpu.queue.submit([mapEncoder.finish()]);
		const [mapError] = await Promise.all([
			gpu.popErrorScope(),
			map.mapAsync(MAP_MODE_READ),
		]);
		if (mapError) throw new Error(`readback: ${mapError.message}`);
	}
	const data = mappedPixels(map, width, height, bytesPerRow);
	const box = detectContentBox(width, height, data);
	let canonical: Uint8Array | undefined;
	if (!box) canonical = scaled ?? undefined;
	else if (normalize && upscalesCubic(box.w, box.h)) {
		canonical = await upscaler.upscale({ buffer: pixels, stride, box });
	}
	target.pixels.push(pixels);
	target.maps.push(map);
	// the gray is of the picture as it stands: only right without bars
	return {
		width,
		height,
		data,
		canonical,
		gray: box ? undefined : (gray ?? undefined),
	};
}

/**
 * The gate pixels of the canonical picture in `picture` (1080p or an
 * INTER_CUBIC upscale), the frame held on the GPU; a frame with bars, whose
 * canonical picture is a crop, is read whole instead.
 */
async function readGates(
	kernels: GpuKernels,
	gather: GatherKernel,
	picture: Picture,
): Promise<ReadFrame | { gates: Uint8Array; held: HeldPixels }> {
	const { gpu, upscaler, lineSums } = kernels;
	const { width, height, bytesPerRow, stride, target, pixels } = picture;
	gpu.pushErrorScope("validation");
	const encoder = gpu.createCommandEncoder();
	encoder.copyTextureToBuffer(
		{ texture: target.texture },
		{ buffer: pixels, bytesPerRow },
		[width, height],
	);
	const upscaled = upscalesCubic(width, height)
		? upscaler.encode(
				encoder,
				{ buffer: pixels, stride, box: { x: 0, y: 0, w: width, h: height } },
				{ mapped: false },
			)
		: null;
	const packed = upscaled
		? gather.encode(encoder, upscaled.canonical, CANONICAL_WIDTH)
		: gather.encode(encoder, pixels, stride);
	const lines = lineSums.encode(encoder, pixels, {
		stride,
		w: width,
		h: height,
	});
	gpu.queue.submit([encoder.finish()]);
	const [submitError, gates, sums] = await Promise.all([
		gpu.popErrorScope(),
		packed.read(),
		lines.read(),
	]);
	const bars = detectContentBoxFromSums(width, height, sums) !== null;
	if (upscaled && (submitError || bars)) upscaler.release(upscaled.read);
	if (submitError) throw new Error(`readback: ${submitError.message}`);
	// the canonical picture of a frame with bars is a crop: read it whole
	if (bars) return readWhole(kernels, picture, true, true);
	return { gates, held: { ...picture, kernels, upscaled } };
}

/** What readWhole returns for a held frame (no bars, by its line sums), read from the buffers it holds. */
async function readHeldWhole({
	kernels: { gpu, upscaler, grayKernel },
	width,
	height,
	bytesPerRow,
	stride,
	target,
	pixels,
	upscaled,
}: HeldPixels): Promise<ReadFrame> {
	const map = takeMap(gpu, target, pixels.size);
	gpu.pushErrorScope("validation");
	const encoder = gpu.createCommandEncoder();
	encoder.copyBufferToBuffer(pixels, 0, map, 0, pixels.size);
	if (upscaled) {
		encoder.copyBufferToBuffer(
			upscaled.canonical,
			0,
			upscaled.read,
			0,
			upscaled.canonical.size,
		);
	}
	const grayRead = upscaled
		? grayKernel.encode(encoder, upscaled.canonical, CANONICAL_WIDTH)
		: grayKernel.encode(encoder, pixels, stride);
	gpu.queue.submit([encoder.finish()]);
	const [submitError, , canonical, gray] = await Promise.all([
		gpu.popErrorScope(),
		map.mapAsync(MAP_MODE_READ),
		upscaled
			? mapCopy(upscaled.read, () => upscaler.release(upscaled.read))
			: null,
		mapCopy(grayRead, () => grayKernel.release(grayRead)),
	]);
	if (submitError) throw new Error(`readback: ${submitError.message}`);
	const data = mappedPixels(map, width, height, bytesPerRow);
	target.pixels.push(pixels);
	target.maps.push(map);
	return { width, height, data, canonical: canonical ?? undefined, gray };
}

function takeMap(gpu: GPUDevice, target: Target, size: number): GPUBuffer {
	return (
		target.maps.pop() ??
		gpu.createBuffer({ size, usage: BUFFER_MAP_READ | BUFFER_COPY_DST })
	);
}

/** RGBA of a mapped frame copy with padded rows; unmaps it. */
function mappedPixels(
	map: GPUBuffer,
	width: number,
	height: number,
	bytesPerRow: number,
): Uint8ClampedArray {
	const mapped = new Uint8Array(map.getMappedRange());
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
	map.unmap();
	return data;
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
	/** the spans the worker was last given */
	let workerSpans: GateRois.GateSpans | null = null;
	let nextId = 0;
	/** in-flight requests; a read holds a clone of its frame until answered */
	const pending = new Map<
		number,
		{
			retry: (() => Promise<ReadFrame | HeldFrame>) | null;
			resolve: (data: ReadFrame | HeldFrame) => void;
			reject: (error: unknown) => void;
		}
	>();
	const heldLocally = (
		read: ReadFrame | (GateRead & { held: number }),
	): ReadFrame | HeldFrame => {
		if (!("held" in read)) return read;
		const { held, ...gateRead } = read;
		return {
			...gateRead,
			whole: () => local.webgpu.whole(held),
			release: () => local.webgpu.release(held),
		};
	};
	const readLocally = (
		frame: VideoFrame,
		options: Required<ReadOptions>,
		spans: GateRois.GateSpans | null,
	) => {
		try {
			return readThrough(local, frame, options, spans).then(heldLocally);
		} catch (error) {
			return Promise.reject(error);
		}
	};
	// a broken worker hands its in-flight frames back to this thread
	const abandonWorker = () => {
		worker?.terminate();
		worker = null;
		for (const { retry, resolve, reject } of pending.values()) {
			if (retry) retry().then(resolve, reject);
			else reject(new Error("readback worker failed"));
		}
		pending.clear();
	};
	const heldInWorker = (held: number, gateRead: GateRead): HeldFrame => ({
		...gateRead,
		whole() {
			if (!worker) {
				return Promise.reject(new Error("readback worker failed"));
			}
			const id = nextId++;
			const result = new Promise<ReadFrame | HeldFrame>((resolve, reject) => {
				pending.set(id, { retry: null, resolve, reject });
			});
			worker.postMessage({
				kind: "whole",
				id,
				held,
			} satisfies ReadbackRequest);
			return result as Promise<ReadFrame>;
		},
		release() {
			worker?.postMessage({ kind: "release", held } satisfies ReadbackRequest);
		},
	});
	if (worker) {
		worker.onmessage = (e: MessageEvent<ReadbackResponse>) => {
			const response = e.data;
			const waiter = pending.get(response.id);
			if (!waiter) return;
			pending.delete(response.id);
			if ("error" in response) {
				if (waiter.retry) waiter.retry().then(waiter.resolve, waiter.reject);
				else waiter.reject(new Error(response.error));
				return;
			}
			if ("held" in response) {
				const { id: _, held, ...gateRead } = response;
				waiter.resolve(heldInWorker(held, gateRead));
			} else {
				waiter.resolve(response);
			}
		};
		worker.onerror = abandonWorker;
	}
	const request = (
		frame: VideoFrame,
		{ path = "canvas", normalize = true }: ReadOptions,
		spans: GateRois.GateSpans | null,
	): Promise<ReadFrame | HeldFrame> => {
		const options = { path, normalize };
		if (!worker) return readLocally(frame, options, spans);
		if (spans && spans !== workerSpans) {
			worker.postMessage({ kind: "gates", spans } satisfies ReadbackRequest);
			workerSpans = spans;
		}
		const id = nextId++;
		const backup = frame.clone();
		const result = new Promise<ReadFrame | HeldFrame>((resolve, reject) => {
			pending.set(id, {
				retry: () => readLocally(backup, options, spans),
				resolve,
				reject,
			});
		});
		worker.postMessage(
			{
				kind: "read",
				id,
				frame,
				...options,
				gates: spans !== null,
			} satisfies ReadbackRequest,
			{ transfer: [frame] },
		);
		// the backup is closed once the read is answered (or read in its place)
		return result.finally(() => backup.close());
	};
	return {
		read(frame, options = {}) {
			return request(frame, options, null) as Promise<ReadFrame>;
		},
		readGates(frame, spans, options = {}) {
			return request(frame, options, spans);
		},
		dispose() {
			worker?.terminate();
			worker = null;
			for (const { reject } of pending.values()) {
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
