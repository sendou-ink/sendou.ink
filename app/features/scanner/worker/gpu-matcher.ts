/**
 * WebGPU batching driver for match steps (core/match-steps.ts). Every pending
 * request of a step becomes jobs (one image against one template, max over a
 * placement window) answered by one submit of three passes:
 *
 * 1. `sat`: per image, integral images of each channel and of the summed
 *    squares (u32, wrapping: a window's sum is exact whenever it fits in 32
 *    bits, which MAX_TEMPLATE_SAMPLES guarantees).
 * 2. `score`: one thread per BLOCK_ROWS vertically adjacent placements of a
 *    job accumulates their cross sums ΣT·I with packed u8 dot products (each
 *    image row read once), takes the window sums from the integral images,
 *    and folds f32 estimates of the scores into the job's max.
 * 3. `select`: placements within EPS of that max recompute their exact
 *    integer sums (64-bit, emulated) and return them; a flat window
 *    (variance 0, score exactly 0) only raises a flag.
 *
 * The CPU finishes the candidates with `normalizeNcc`: the exact score,
 * identical on every GPU and to the CPU driver's (`runSync`), which scores
 * exactly too. scripts/scanner/gpu-replay.ts checks both against a JS
 * reference.
 */
import { getCV, type Mat } from "../core/cv";
import {
	exactMatchMax,
	type MatchRequest,
	type MatchSteps,
	normalizeNcc,
	runSync,
} from "../core/match-steps";

/** Candidate placements returned per job; more near-ties fall back to the CPU. */
const K = 8;
/** Candidate margin under the f32 max; the estimate's error is ~1e-6. */
const EPS = 1e-4;
const WORKGROUP_SIZE = 64;
/** placements one score thread covers, stacked vertically so each image row is read once */
const BLOCK_ROWS = 4;
const JOB_U32 = 16;
const IMAGE_U32 = 8;
/** per job: count | ZERO_FLAG, then K × (num lo, num hi | sign, variance lo, variance hi) */
const OUT_U32 = 1 + 4 * K;
const ZERO_FLAG = 0x80000000;
const MAX_DISPATCH_X = 65535;
/** Samples per template (rows × cols × channels) whose u8 products still sum below 2^32. */
const MAX_TEMPLATE_SAMPLES = Math.floor(0xffffffff / (255 * 255));
/** Widest request image the numeric score-cache keys cover (canonical frames are 1920 wide). */
const MAX_IMAGE_COLS = 4096;
const WINDOW_KEYS = MAX_IMAGE_COLS * MAX_IMAGE_COLS;
/** Words after each packed image: the funnel-shifted reads run one word past a row (those bytes only meet zero template padding). */
const IMAGE_PAD_WORDS = 2;
/** GPUBufferUsage / GPUMapMode flags (spec values; the globals are missing from the TS DOM lib) */
const BUFFER_MAP_READ = 0x0001;
const BUFFER_COPY_SRC = 0x0004;
const BUFFER_COPY_DST = 0x0008;
const BUFFER_UNIFORM = 0x0040;
const BUFFER_STORAGE = 0x0080;
const BUFFER_QUERY_RESOLVE = 0x0200;
const MAP_MODE_READ = 0x0001;

const shader = (packedDot: boolean) => /* wgsl */ `
${packedDot ? "requires packed_4x8_integer_dot_product;" : ""}

struct Params {
  total: u32, jobCount: u32, startsOff: u32, imagesOff: u32,
  imageCount: u32, blocks: u32, blockStartsOff: u32,
};

@group(0) @binding(0) var<storage, read> img: array<u32>;
@group(0) @binding(1) var<storage, read> tpl: array<u32>;
@group(0) @binding(2) var<storage, read_write> sat: array<u32>;
@group(0) @binding(3) var<storage, read> info: array<u32>;
@group(0) @binding(4) var<storage, read_write> scratch: array<u32>;
@group(0) @binding(5) var<storage, read_write> outs: array<atomic<u32>>;
@group(0) @binding(6) var<uniform> params: Params;

fn dot4(a: u32, b: u32) -> u32 {
  ${
		packedDot
			? "return dot4U8Packed(a, b);"
			: `return (a & 0xffu) * (b & 0xffu) + ((a >> 8u) & 0xffu) * ((b >> 8u) & 0xffu)
    + ((a >> 16u) & 0xffu) * ((b >> 16u) & 0xffu) + (a >> 24u) * (b >> 24u);`
	}
}

fn mul64(a: u32, b: u32) -> vec2<u32> {
  let a0 = a & 0xffffu; let a1 = a >> 16u;
  let b0 = b & 0xffffu; let b1 = b >> 16u;
  let p00 = a0 * b0; let p01 = a0 * b1; let p10 = a1 * b0; let p11 = a1 * b1;
  let mid = (p00 >> 16u) + (p01 & 0xffffu) + (p10 & 0xffffu);
  return vec2<u32>((p00 & 0xffffu) | (mid << 16u), p11 + (p01 >> 16u) + (p10 >> 16u) + (mid >> 16u));
}
fn add64(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
  let lo = a.x + b.x;
  return vec2<u32>(lo, a.y + b.y + select(0u, 1u, lo < a.x));
}
fn sub64(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
  return vec2<u32>(a.x - b.x, a.y - b.y - select(0u, 1u, a.x < b.x));
}
fn ge64(a: vec2<u32>, b: vec2<u32>) -> bool { return a.y > b.y || (a.y == b.y && a.x >= b.x); }
fn toF(a: vec2<u32>) -> f32 { return f32(a.y) * 4294967296.0 + f32(a.x); }
fn diffF(a: vec2<u32>, b: vec2<u32>) -> f32 {
  if (ge64(a, b)) { return toF(sub64(a, b)); }
  return -toF(sub64(b, a));
}
fn orderedBits(v: f32) -> u32 {
  let b = bitcast<u32>(v);
  return select(b | 0x80000000u, ~b, (b & 0x80000000u) != 0u);
}
fn fromOrdered(b: u32) -> f32 {
  return bitcast<f32>(select(~b, b & 0x7fffffffu, (b & 0x80000000u) != 0u));
}

struct Job {
  imgOff: u32, rows: u32, cols: u32, ch: u32, satOff: u32,
  tplOff: u32, tRows: u32, tCols: u32, tRowWords: u32,
  lo: u32, w: u32, n: u32, tvarF: f32, tSum: vec3<u32>,
};
fn job(j: u32) -> Job {
  let b = j * ${JOB_U32}u;
  return Job(info[b], info[b + 1u], info[b + 2u], info[b + 3u], info[b + 4u],
    info[b + 5u], info[b + 6u], info[b + 7u], info[b + 8u],
    info[b + 9u], info[b + 10u], info[b + 11u], bitcast<f32>(info[b + 12u]),
    vec3<u32>(info[b + 13u], info[b + 14u], info[b + 15u]));
}
/** the job owning index g of a per-job prefix array at off: the last j with prefix[j] <= g */
fn jobIn(off: u32, g: u32) -> u32 {
  var lo = 0u; var hi = params.jobCount;
  while (lo + 1u < hi) {
    let mid = (lo + hi) >> 1u;
    if (info[off + mid] <= g) { lo = mid; } else { hi = mid; }
  }
  return lo;
}

fn satAt(jb: Job, x: u32, y: u32, c: u32) -> u32 {
  return sat[jb.satOff + (y * (jb.cols + 1u) + x) * (jb.ch + 1u) + c];
}
fn windowSum(jb: Job, x0: u32, y0: u32, c: u32) -> u32 {
  let x1 = x0 + jb.tCols; let y1 = y0 + jb.tRows;
  return satAt(jb, x1, y1, c) - satAt(jb, x0, y1, c) - satAt(jb, x1, y0, c) + satAt(jb, x0, y0, c);
}

struct Sums { numA: vec2<u32>, numB: vec2<u32>, varA: vec2<u32>, varB: vec2<u32> };
fn sums(jb: Job, rx: u32, ry: u32, P: u32) -> Sums {
  let Q = windowSum(jb, rx, ry, jb.ch);
  var numB = vec2<u32>(0u); var varB = vec2<u32>(0u);
  for (var c = 0u; c < jb.ch; c++) {
    let S = windowSum(jb, rx, ry, c);
    numB = add64(numB, mul64(S, jb.tSum[c]));
    varB = add64(varB, mul64(S, S));
  }
  return Sums(mul64(jb.n, P), numB, mul64(jb.n, Q), varB);
}
fn estimate(jb: Job, s: Sums) -> f32 {
  let wvar = diffF(s.varA, s.varB);
  if (wvar <= 0.0) { return 0.0; }
  return clamp(diffF(s.numA, s.numB) / (sqrt(wvar) * sqrt(jb.tvarF)), -1.0, 1.0);
}

/**
 * Cross sums of the ${BLOCK_ROWS} vertically adjacent placements (rx, ry0 + d),
 * d < n: every image row is read once and meets each template row it overlaps.
 */
fn crossSums(jb: Job, rx: u32, ry0: u32, n: u32) -> vec4<u32> {
  var P0 = 0u; var P1 = 0u; var P2 = 0u; var P3 = 0u;
  let rows = jb.tRows + n - 1u;
  for (var y = 0u; y < rows; y++) {
    let B = ((ry0 + y) * jb.cols + rx) * jb.ch;
    var wi = jb.imgOff + (B >> 2u);
    let r = (B & 3u) * 8u;
    var cur = img[wi];
    let use0 = y < jb.tRows;
    let use1 = n > 1u && y >= 1u && y - 1u < jb.tRows;
    let use2 = n > 2u && y >= 2u && y - 2u < jb.tRows;
    let use3 = n > 3u && y >= 3u && y - 3u < jb.tRows;
    let t0 = jb.tplOff + y * jb.tRowWords;
    let t1 = t0 - jb.tRowWords; let t2 = t1 - jb.tRowWords; let t3 = t2 - jb.tRowWords;
    for (var k = 0u; k < jb.tRowWords; k++) {
      wi++;
      let nxt = img[wi];
      let w = select((cur >> r) | (nxt << (32u - r)), cur, r == 0u);
      cur = nxt;
      if (use0) { P0 += dot4(w, tpl[t0 + k]); }
      if (use1) { P1 += dot4(w, tpl[t1 + k]); }
      if (use2) { P2 += dot4(w, tpl[t2 + k]); }
      if (use3) { P3 += dot4(w, tpl[t3 + k]); }
    }
  }
  return vec4<u32>(P0, P1, P2, P3);
}

fn globalId(gid: vec3<u32>, nwg: vec3<u32>) -> u32 {
  return gid.x + gid.y * nwg.x * ${WORKGROUP_SIZE}u;
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn satMain(@builtin(workgroup_id) wg: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>,
    @builtin(local_invocation_index) lid: u32) {
  let i = wg.x + wg.y * nwg.x;
  if (i >= params.imageCount) { return; }
  let b = params.imagesOff + i * ${IMAGE_U32}u;
  let off = info[b]; let rows = info[b + 1u]; let cols = info[b + 2u]; let ch = info[b + 3u];
  let satOff = info[b + 4u];
  let stride = ch + 1u;
  // row prefixes, row 0 and column 0 zero
  for (var x = lid; x <= cols; x += ${WORKGROUP_SIZE}u) {
    for (var c = 0u; c <= ch; c++) { sat[satOff + x * stride + c] = 0u; }
  }
  for (var y = lid; y < rows; y += ${WORKGROUP_SIZE}u) {
    let rowBase = satOff + (y + 1u) * (cols + 1u) * stride;
    var acc = vec4<u32>(0u);
    for (var c = 0u; c <= ch; c++) { sat[rowBase + c] = 0u; }
    for (var x = 0u; x < cols; x++) {
      var q = 0u;
      for (var c = 0u; c < ch; c++) {
        let B = (y * cols + x) * ch + c;
        let v = (img[off + (B >> 2u)] >> ((B & 3u) * 8u)) & 0xffu;
        acc[c] += v;
        q += v * v;
      }
      acc[3] += q;
      let o = rowBase + (x + 1u) * stride;
      for (var c = 0u; c < ch; c++) { sat[o + c] = acc[c]; }
      sat[o + ch] = acc[3];
    }
  }
  storageBarrier();
  workgroupBarrier();
  // column prefixes
  for (var x = lid + 1u; x <= cols; x += ${WORKGROUP_SIZE}u) {
    for (var y = 2u; y <= rows; y++) {
      let o = satOff + (y * (cols + 1u) + x) * stride;
      let p = o - (cols + 1u) * stride;
      for (var c = 0u; c <= ch; c++) { sat[o + c] += sat[p + c]; }
    }
  }
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn scoreMain(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
  let g = globalId(gid, nwg);
  if (g >= params.blocks) { return; }
  let j = jobIn(params.blockStartsOff, g);
  let jb = job(j);
  let b = g - info[params.blockStartsOff + j];
  let rx = jb.lo + b % jb.w;
  let ry0 = (b / jb.w) * ${BLOCK_ROWS}u;
  let n = min(${BLOCK_ROWS}u, jb.rows - jb.tRows + 1u - ry0);
  let P = crossSums(jb, rx, ry0, n);
  let base = info[params.startsOff + j] + rx - jb.lo;
  var best = 0u;
  for (var d = 0u; d < n; d++) {
    scratch[base + (ry0 + d) * jb.w] = P[d];
    best = max(best, orderedBits(estimate(jb, sums(jb, rx, ry0 + d, P[d]))));
  }
  atomicMax(&outs[j], best);
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn selectMain(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
  let g = globalId(gid, nwg);
  if (g >= params.total) { return; }
  let j = jobIn(params.startsOff, g);
  let jb = job(j);
  let p = g - info[params.startsOff + j];
  let rx = jb.lo + p % jb.w; let ry = p / jb.w;
  let s = sums(jb, rx, ry, scratch[g]);
  if (estimate(jb, s) < fromOrdered(atomicLoad(&outs[j])) - ${EPS}) { return; }
  let base = params.jobCount + j * ${OUT_U32}u;
  let wv = sub64(s.varA, s.varB);
  if (wv.x == 0u && wv.y == 0u) {
    atomicOr(&outs[base], ${ZERO_FLAG}u);
    return;
  }
  let i = atomicAdd(&outs[base], 1u) & ${~ZERO_FLAG >>> 0}u;
  if (i >= ${K}u) { return; }
  let neg = !ge64(s.numA, s.numB);
  let num = select(sub64(s.numA, s.numB), sub64(s.numB, s.numA), neg);
  let o = base + 1u + i * 4u;
  atomicStore(&outs[o], num.x);
  atomicStore(&outs[o + 1u], num.y | select(0u, 0x80000000u, neg));
  atomicStore(&outs[o + 2u], wv.x);
  atomicStore(&outs[o + 3u], wv.y);
}
`;

interface U8Image {
	rows: number;
	cols: number;
	ch: number;
	data: Uint8Array;
}

interface TemplateEntry {
	/** sequential, for numeric score-cache keys */
	id: number;
	image: U8Image;
	/** offset into the GPU template buffer, in words; rows padded to whole words */
	offset: number;
	rowWords: number;
	n: number;
	sum: number[];
	/** Σ_c (N·ΣT_c² − (ΣT_c)²) */
	varInt: number;
}

interface Job {
	image: U8Image;
	template: TemplateEntry;
	lo: number;
	hi: number;
	/** score arrays (and indices into them) waiting on this job, plus its cache slot */
	targets: number[][];
	targetIndices: number[];
	cache: Map<number, number> | null;
	cacheKey: number;
}

function resolveJob(job: Job, score: number) {
	for (const [t, target] of job.targets.entries()) {
		target[job.targetIndices[t]!] = score;
	}
	job.cache?.set(job.cacheKey, score);
}

export interface GpuMatcherStats {
	steps: number;
	dispatches: number;
	jobs: number;
	placements: number;
	cacheHits: number;
	/** jobs finished on the CPU: more than K near-tied placements */
	cpuFallbacks: number;
	/** jobs the kernel cannot take (channel layout, template size), matched on the CPU */
	unsupported: number;
	/** submit to readback, summed */
	gpuWaitMs: number;
	/** kernel time from timestamp queries (only when created with `timestamps`) */
	kernelMs: number;
}

export interface GpuMatcher {
	/**
	 * Runs `steps` to completion, answering each step's requests with at most
	 * one submit. A device lost mid-run hands the pending step to the CPU
	 * (runSync), so the generators run exactly once either way.
	 */
	run<T>(steps: MatchSteps<T>): Promise<T>;
	/** the matcher's device, shared with the frame scaler */
	readonly device: GPUDevice;
	/** the device is gone; callers switch to the CPU path */
	readonly lost: boolean;
	readonly lostReason: string | null;
	stats: GpuMatcherStats;
	destroy(): void;
}

export async function createGpuMatcher(
	gpu: GPU,
	options: { timestamps?: boolean } = {},
): Promise<GpuMatcher> {
	const adapter = await gpu.requestAdapter({
		powerPreference: "high-performance",
	});
	if (!adapter) throw new Error("no WebGPU adapter");
	const timestamps =
		options.timestamps === true && adapter.features.has("timestamp-query");
	const device = await adapter.requestDevice({
		requiredFeatures: timestamps ? ["timestamp-query"] : [],
		requiredLimits: {
			maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
			maxBufferSize: adapter.limits.maxBufferSize,
		},
	});
	device.pushErrorScope("validation");
	const module = device.createShaderModule({
		code: shader(
			gpu.wgslLanguageFeatures.has("packed_4x8_integer_dot_product"),
		),
	});
	const pipeline = (entryPoint: string) =>
		device.createComputePipeline({
			layout: "auto",
			compute: { module, entryPoint },
		});
	const satPipeline = pipeline("satMain");
	const scorePipeline = pipeline("scoreMain");
	const selectPipeline = pipeline("selectMain");
	const pipelineError = await device.popErrorScope();
	if (pipelineError) {
		device.destroy();
		throw new Error(`matcher pipelines: ${pipelineError.message}`);
	}
	const stats: GpuMatcherStats = {
		steps: 0,
		dispatches: 0,
		jobs: 0,
		placements: 0,
		cacheHits: 0,
		cpuFallbacks: 0,
		unsupported: 0,
		gpuWaitMs: 0,
		kernelMs: 0,
	};

	// templates are long-lived (glyph atlases, weapon icons): packed once, on
	// first use, into one growable buffer that only uploads what is new
	const templates = new Map<Mat, TemplateEntry>();
	let templateMirror = new Uint32Array(1 << 20);
	let templateBytes = new Uint8Array(templateMirror.buffer);
	let templateLength = 0;
	let templateUploaded = 0;
	let templateBuffer: GPUBuffer | null = null;
	const templateOf = (mat: Mat): TemplateEntry => {
		const known = templates.get(mat);
		if (known) return known;
		const image = readPixels(mat);
		const rowBytes = image.cols * image.ch;
		const rowWords = Math.ceil(rowBytes / 4);
		const words = image.rows * rowWords;
		if (templateLength + words > templateMirror.length) {
			const grown = new Uint32Array(
				2 ** Math.ceil(Math.log2(templateLength + words)),
			);
			grown.set(templateMirror.subarray(0, templateLength));
			templateMirror = grown;
			templateBytes = new Uint8Array(grown.buffer);
		}
		for (let y = 0; y < image.rows; y++) {
			templateBytes.set(
				image.data.subarray(y * rowBytes, (y + 1) * rowBytes),
				(templateLength + y * rowWords) * 4,
			);
		}
		const entry = {
			id: templates.size,
			image,
			offset: templateLength,
			rowWords,
			...templateStats(image),
		};
		templateLength += words;
		templates.set(mat, entry);
		return entry;
	};
	const syncTemplates = () => {
		if (!templateBuffer || templateBuffer.size < templateLength * 4) {
			templateBuffer?.destroy();
			templateBuffer = device.createBuffer({
				size: Math.max(256, templateMirror.byteLength),
				usage: BUFFER_STORAGE | BUFFER_COPY_DST,
			});
			templateUploaded = 0;
		}
		if (templateUploaded < templateLength) {
			device.queue.writeBuffer(
				templateBuffer,
				templateUploaded * 4,
				templateMirror,
				templateUploaded,
				templateLength - templateUploaded,
			);
			templateUploaded = templateLength;
		}
		return templateBuffer;
	};

	const pool = new Map<string, GPUBuffer>();
	const pooled = (name: string, bytes: number, usage: number) => {
		const have = pool.get(name);
		if (have && have.size >= bytes) return have;
		have?.destroy();
		const buffer = device.createBuffer({
			size: Math.max(256, 2 ** Math.ceil(Math.log2(bytes))),
			usage,
		});
		pool.set(name, buffer);
		return buffer;
	};
	const paramsBuffer = device.createBuffer({
		size: 32,
		usage: BUFFER_UNIFORM | BUFFER_COPY_DST,
	});
	const querySet = timestamps
		? device.createQuerySet({ type: "timestamp", count: 2 })
		: null;
	const queryBuffer = timestamps
		? device.createBuffer({
				size: 16,
				usage: BUFFER_QUERY_RESOLVE | BUFFER_COPY_SRC,
			})
		: null;

	let imageWords = new Uint32Array(1 << 16);
	let meta = new Uint32Array(1 << 16);

	async function dispatch(jobs: Job[]): Promise<void> {
		stats.dispatches++;
		stats.jobs += jobs.length;

		// images, each word-aligned and padded, with their integral-image slots
		const imageIndex = new Map<U8Image, number>();
		const images: { image: U8Image; offset: number; satOffset: number }[] = [];
		let wordLength = 0;
		let satLength = 0;
		for (const { image } of jobs) {
			if (imageIndex.has(image)) continue;
			imageIndex.set(image, images.length);
			images.push({ image, offset: wordLength, satOffset: satLength });
			wordLength += Math.ceil(image.data.length / 4) + IMAGE_PAD_WORDS;
			satLength += (image.rows + 1) * (image.cols + 1) * (image.ch + 1);
		}
		// stale padding is harmless: it only ever meets zero template padding
		if (imageWords.length < wordLength) {
			imageWords = new Uint32Array(2 ** Math.ceil(Math.log2(wordLength)));
		}
		const imageBytes = new Uint8Array(imageWords.buffer);
		for (const { image, offset } of images)
			imageBytes.set(image.data, offset * 4);

		// meta: jobs, placement prefix, images
		const startsOffset = jobs.length * JOB_U32;
		const blockStartsOffset = startsOffset + jobs.length + 1;
		const imagesOffset = blockStartsOffset + jobs.length + 1;
		const metaLength = imagesOffset + images.length * IMAGE_U32;
		if (meta.length < metaLength) {
			meta = new Uint32Array(2 ** Math.ceil(Math.log2(metaLength)));
		}
		const metaFloats = new Float32Array(meta.buffer);
		let total = 0;
		let blocks = 0;
		for (const [i, { image, template, lo, hi }] of jobs.entries()) {
			const { offset, satOffset } = images[imageIndex.get(image)!]!;
			const b = i * JOB_U32;
			meta[b] = offset;
			meta[b + 1] = image.rows;
			meta[b + 2] = image.cols;
			meta[b + 3] = image.ch;
			meta[b + 4] = satOffset;
			meta[b + 5] = template.offset;
			meta[b + 6] = template.image.rows;
			meta[b + 7] = template.image.cols;
			meta[b + 8] = template.rowWords;
			meta[b + 9] = lo;
			meta[b + 10] = hi - lo + 1;
			meta[b + 11] = template.n;
			metaFloats[b + 12] = template.varInt;
			meta[b + 13] = template.sum[0] ?? 0;
			meta[b + 14] = template.sum[1] ?? 0;
			meta[b + 15] = template.sum[2] ?? 0;
			const rows = image.rows - template.image.rows + 1;
			meta[startsOffset + i] = total;
			total += rows * (hi - lo + 1);
			meta[blockStartsOffset + i] = blocks;
			blocks += Math.ceil(rows / BLOCK_ROWS) * (hi - lo + 1);
		}
		meta[startsOffset + jobs.length] = total;
		meta[blockStartsOffset + jobs.length] = blocks;
		for (const [i, { image, offset, satOffset }] of images.entries()) {
			const b = imagesOffset + i * IMAGE_U32;
			meta[b] = offset;
			meta[b + 1] = image.rows;
			meta[b + 2] = image.cols;
			meta[b + 3] = image.ch;
			meta[b + 4] = satOffset;
		}
		stats.placements += total;

		const tplBuffer = syncTemplates();
		const imgBuffer = pooled(
			"img",
			wordLength * 4,
			BUFFER_STORAGE | BUFFER_COPY_DST,
		);
		const satBuffer = pooled("sat", satLength * 4, BUFFER_STORAGE);
		const metaBuffer = pooled(
			"meta",
			metaLength * 4,
			BUFFER_STORAGE | BUFFER_COPY_DST,
		);
		const scratchBuffer = pooled("scratch", total * 4, BUFFER_STORAGE);
		const outLength = jobs.length * (1 + OUT_U32);
		const outBytes = outLength * 4;
		const outBuffer = pooled(
			"out",
			outBytes,
			BUFFER_STORAGE | BUFFER_COPY_SRC | BUFFER_COPY_DST,
		);
		const readBuffer = pooled(
			"read",
			outBytes,
			BUFFER_MAP_READ | BUFFER_COPY_DST,
		);
		device.queue.writeBuffer(imgBuffer, 0, imageWords, 0, wordLength);
		device.queue.writeBuffer(metaBuffer, 0, meta, 0, metaLength);
		device.queue.writeBuffer(
			paramsBuffer,
			0,
			new Uint32Array([
				total,
				jobs.length,
				startsOffset,
				imagesOffset,
				images.length,
				blocks,
				blockStartsOffset,
				0,
			]),
		);

		const encoder = device.createCommandEncoder();
		encoder.clearBuffer(outBuffer, 0, outBytes);
		const pass = encoder.beginComputePass(
			querySet
				? {
						timestampWrites: {
							querySet,
							beginningOfPassWriteIndex: 0,
							endOfPassWriteIndex: 1,
						},
					}
				: {},
		);
		pass.setPipeline(satPipeline);
		pass.setBindGroup(0, bindAll(satPipeline, [0, 2, 3, 6]));
		pass.dispatchWorkgroups(...grid(images.length));
		pass.setPipeline(scorePipeline);
		pass.setBindGroup(0, bindAll(scorePipeline, [0, 1, 2, 3, 4, 5, 6]));
		pass.dispatchWorkgroups(...grid(Math.ceil(blocks / WORKGROUP_SIZE)));
		pass.setPipeline(selectPipeline);
		pass.setBindGroup(0, bindAll(selectPipeline, [2, 3, 4, 5, 6]));
		pass.dispatchWorkgroups(...grid(Math.ceil(total / WORKGROUP_SIZE)));
		pass.end();
		if (querySet && queryBuffer) {
			encoder.resolveQuerySet(querySet, 0, 2, queryBuffer, 0);
			encoder.copyBufferToBuffer(
				queryBuffer,
				0,
				pooled("query", 16, BUFFER_MAP_READ | BUFFER_COPY_DST),
				0,
				16,
			);
		}
		encoder.copyBufferToBuffer(
			outBuffer,
			jobs.length * 4,
			readBuffer,
			0,
			jobs.length * OUT_U32 * 4,
		);
		device.queue.submit([encoder.finish()]);
		const waitStart = performance.now();
		const readBytes = jobs.length * OUT_U32 * 4;
		await readBuffer.mapAsync(MAP_MODE_READ, 0, readBytes);
		stats.gpuWaitMs += performance.now() - waitStart;
		const out = new Uint32Array(
			readBuffer.getMappedRange(0, readBytes).slice(0),
		);
		readBuffer.unmap();
		if (querySet) {
			const read = pool.get("query")!;
			await read.mapAsync(MAP_MODE_READ, 0, 16);
			const [begin, end] = new BigUint64Array(read.getMappedRange(0, 16));
			stats.kernelMs += Number(end! - begin!) / 1e6;
			read.unmap();
		}

		for (const [i, job] of jobs.entries()) {
			const b = i * OUT_U32;
			const info = out[b]!;
			const count = (info & ~ZERO_FLAG) >>> 0;
			if (count > K || (count === 0 && !(info & ZERO_FLAG))) {
				stats.cpuFallbacks++;
				resolveJob(
					job,
					exactMatchMax(job.image, job.template.image, job.lo, job.hi),
				);
				continue;
			}
			let best = info & ZERO_FLAG ? 0 : Number.NEGATIVE_INFINITY;
			for (let c = 0; c < count; c++) {
				const o = b + 1 + c * 4;
				const hi = out[o + 1]!;
				const magnitude = (hi & 0x7fffffff) * 2 ** 32 + out[o]!;
				const score = normalizeNcc(
					hi & 0x80000000 ? -magnitude : magnitude,
					out[o + 3]! * 2 ** 32 + out[o + 2]!,
					job.template.varInt,
				);
				if (score > best) best = score;
			}
			resolveJob(job, best);
		}

		function bindAll(pipe: GPUComputePipeline, bindings: number[]) {
			const byBinding: Record<number, GPUBuffer> = {
				0: imgBuffer,
				1: tplBuffer,
				2: satBuffer,
				3: metaBuffer,
				4: scratchBuffer,
				5: outBuffer,
				6: paramsBuffer,
			};
			return device.createBindGroup({
				layout: pipe.getBindGroupLayout(0),
				entries: bindings.map((binding) => ({
					binding,
					resource: { buffer: byBinding[binding]! },
				})),
			});
		}
	}

	let lost = false;
	let lostReason: string | null = null;
	void device.lost.then((info) => {
		lostReason ??= info.message || info.reason;
		lost = true;
	});

	async function run<T>(steps: MatchSteps<T>): Promise<T> {
		const cache = new Map<string, Map<number, number>>();
		const keyedImages = new Map<string, U8Image>();
		let step = steps.next();
		while (!step.done) {
			if (lost) return runSync(steps, step);
			stats.steps++;
			const jobs: Job[] = [];
			const inflight = new Map<string, Map<number, Job>>();
			const answers = step.value.map((request) =>
				answer(request, cache, inflight, keyedImages, jobs),
			);
			if (jobs.length > 0) {
				try {
					await dispatch(jobs);
				} catch (error) {
					// a lost device fails the readback, sometimes before `device.lost` settles
					lostReason ??= String(error);
					lost = true;
					return runSync(steps, step);
				}
			}
			step = steps.next(answers.map((scores) => (i: number) => scores[i]!));
		}
		return step.value;
	}

	function answer(
		request: MatchRequest,
		cache: Map<string, Map<number, number>>,
		inflight: Map<string, Map<number, Job>>,
		keyedImages: Map<string, U8Image>,
		jobs: Job[],
	): number[] {
		const scores = new Array<number>(request.templates.length);
		const { key, windows } = request;
		const cached = key === undefined ? null : entriesOf(cache, key);
		const pending = key === undefined ? null : entriesOf(inflight, key);
		let image: U8Image | null = null;
		for (const [i, mat] of request.templates.entries()) {
			const template = templateOf(mat);
			// a score is the max over its window, so the window is part of its identity
			const window = windows?.[i];
			const scoreKey =
				template.id * WINDOW_KEYS +
				(window ? window[0] * MAX_IMAGE_COLS + window[1] : WINDOW_KEYS - 1);
			const hit = cached?.get(scoreKey);
			if (hit !== undefined) {
				stats.cacheHits++;
				scores[i] = hit;
				continue;
			}
			const waiting = pending?.get(scoreKey);
			if (waiting) {
				stats.cacheHits++;
				waiting.targets.push(scores);
				waiting.targetIndices.push(i);
				continue;
			}
			image ??=
				key === undefined
					? readPixels(request.image)
					: (keyedImages.get(key) ??
						keyedImages.set(key, readPixels(request.image)).get(key)!);
			const [lo, hi] = window ?? [0, image.cols - template.image.cols];
			const job: Job = {
				image,
				template,
				lo,
				hi,
				targets: [scores],
				targetIndices: [i],
				cache: cached,
				cacheKey: scoreKey,
			};
			if (template.varInt === 0) {
				resolveJob(job, 1);
				continue;
			}
			if (
				(image.ch !== 1 && image.ch !== 3) ||
				image.ch !== template.image.ch ||
				template.n * template.image.ch > MAX_TEMPLATE_SAMPLES ||
				image.cols > MAX_IMAGE_COLS
			) {
				stats.unsupported++;
				resolveJob(job, exactMatchMax(image, template.image, lo, hi));
				continue;
			}
			pending?.set(scoreKey, job);
			jobs.push(job);
		}
		return scores;
	}

	return {
		run,
		device,
		get lost() {
			return lost;
		},
		get lostReason() {
			return lostReason;
		},
		stats,
		destroy: () => device.destroy(),
	};
}

function entriesOf<V>(cache: Map<string, Map<number, V>>, key: string) {
	let entries = cache.get(key);
	if (!entries) {
		entries = new Map();
		cache.set(key, entries);
	}
	return entries;
}

/** Workgroup grid for `count` workgroups, split over y past the per-dimension limit. */
function grid(count: number): [number, number] {
	return [
		Math.max(1, Math.min(count, MAX_DISPATCH_X)),
		Math.max(1, Math.ceil(count / MAX_DISPATCH_X)),
	];
}

function readPixels(mat: Mat): U8Image {
	const copy = new (getCV().Mat)();
	mat.copyTo(copy);
	const image = {
		rows: copy.rows,
		cols: copy.cols,
		ch: copy.channels(),
		data: new Uint8Array(copy.data),
	};
	copy.delete();
	return image;
}

function templateStats(t: U8Image) {
	const n = t.rows * t.cols;
	const sum = new Array<number>(t.ch).fill(0);
	const sq = new Array<number>(t.ch).fill(0);
	for (let i = 0; i < n; i++) {
		for (let c = 0; c < t.ch; c++) {
			const v = t.data[i * t.ch + c]!;
			sum[c]! += v;
			sq[c]! += v * v;
		}
	}
	let varInt = 0;
	for (let c = 0; c < t.ch; c++) varInt += n * sq[c]! - sum[c]! * sum[c]!;
	return { n, sum, varInt };
}
