/**
 * normalizeFrame (core/image.ts) with its INTER_CUBIC upscale on the GPU —
 * the costliest per-frame step for sub-1080p sources (~13-25 ms of WASM per
 * 720p frame). The kernel reproduces OpenCV's 8-bit cubic resize exactly: the
 * same coefficient tables (float math and lrint rounding, computed here in f32
 * steps), the horizontal pass as integer sums, the vertical pass as the
 * fixed-point combine `(Σ + 2^21) >> 22` with saturation, clamped borders.
 * Integer arithmetic makes it identical on every GPU; frames it does not cover
 * (exact 1080p copies, INTER_AREA downscales) run the CPU path unchanged.
 */
import {
	CANONICAL_HEIGHT,
	CANONICAL_WIDTH,
	detectContentBox,
} from "../core/canonical";
import { getCV, type Mat } from "../core/cv";
import { normalizeFrame } from "../core/image";

const WORKGROUP_SIZE = 64;
const MAX_DISPATCH_X = 65535;
/** INTER_RESIZE_COEF_SCALE */
const COEF_SCALE = 2048;
const BUFFER_MAP_READ = 0x0001;
const BUFFER_COPY_SRC = 0x0004;
const BUFFER_COPY_DST = 0x0008;
const BUFFER_UNIFORM = 0x0040;
const BUFFER_STORAGE = 0x0080;
const MAP_MODE_READ = 0x0001;

const SHADER = /* wgsl */ `
struct Params { srcStride: u32, x0: u32, y0: u32, w: u32, h: u32, dw: u32, dh: u32, _pad: u32 };

@group(0) @binding(0) var<storage, read> src: array<u32>;
@group(0) @binding(1) var<storage, read> tables: array<i32>;
@group(0) @binding(2) var<storage, read_write> dst: array<u32>;
@group(0) @binding(3) var<uniform> params: Params;

fn texel(x: i32, y: i32) -> vec4<i32> {
  let cx = u32(clamp(x, 0, i32(params.w) - 1));
  let cy = u32(clamp(y, 0, i32(params.h) - 1));
  let p = src[(params.y0 + cy) * params.srcStride + params.x0 + cx];
  return vec4<i32>(i32(p & 0xffu), i32((p >> 8u) & 0xffu), i32((p >> 16u) & 0xffu), i32(p >> 24u));
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
  let i = gid.x + gid.y * nwg.x * ${WORKGROUP_SIZE}u;
  if (i >= params.dw * params.dh) { return; }
  let dx = i % params.dw; let dy = i / params.dw;
  // tables: per column (sx, 4 coefficients), then per row (sy, 4 coefficients)
  let xb = dx * 5u; let yb = (params.dw + dy) * 5u;
  let sx = tables[xb]; let sy = tables[yb];
  var acc = vec4<i32>(0);
  for (var k = 0; k < 4; k++) {
    var h = vec4<i32>(0);
    for (var j = 0; j < 4; j++) {
      h += texel(sx - 1 + j, sy - 1 + k) * tables[xb + 1u + u32(j)];
    }
    acc += h * tables[yb + 1u + u32(k)];
  }
  let v = vec4<u32>(clamp((acc + vec4<i32>(1 << 21)) >> vec4<u32>(22u), vec4<i32>(0), vec4<i32>(255)));
  dst[i] = v.x | (v.y << 8u) | (v.z << 16u) | (v.w << 24u);
}
`;

export interface GpuFrameScaler {
	/** normalizeFrame, with sub-canonical pictures upscaled on the GPU; a failed dispatch falls back to the CPU. */
	normalize(src: Mat): Promise<Mat>;
}

export async function createGpuFrameScaler(
	device: GPUDevice,
): Promise<GpuFrameScaler> {
	device.pushErrorScope("validation");
	const pipeline = device.createComputePipeline({
		layout: "auto",
		compute: {
			module: device.createShaderModule({ code: SHADER }),
			entryPoint: "main",
		},
	});
	const pipelineError = await device.popErrorScope();
	if (pipelineError)
		throw new Error(`scaler pipeline: ${pipelineError.message}`);
	const paramsBuffer = device.createBuffer({
		size: 32,
		usage: BUFFER_UNIFORM | BUFFER_COPY_DST,
	});
	const tablesByShape = new Map<string, Int32Array>();
	const dstBytes = CANONICAL_WIDTH * CANONICAL_HEIGHT * 4;
	const dstBuffer = device.createBuffer({
		size: dstBytes,
		usage: BUFFER_STORAGE | BUFFER_COPY_SRC,
	});
	const readBuffer = device.createBuffer({
		size: dstBytes,
		usage: BUFFER_MAP_READ | BUFFER_COPY_DST,
	});
	let srcBuffer: GPUBuffer | null = null;
	let tablesBuffer: GPUBuffer | null = null;
	let tablesKey = "";
	let failed = false;

	async function normalize(src: Mat): Promise<Mat> {
		if (failed) return normalizeFrame(src);
		const box = detectContentBox(src.cols, src.rows, src.data as Uint8Array);
		const x0 = box?.x ?? 0;
		const y0 = box?.y ?? 0;
		const w = box?.w ?? src.cols;
		const h = box?.h ?? src.rows;
		// exact-size copies and INTER_AREA downscales stay on the CPU
		if (
			(w === CANONICAL_WIDTH && h === CANONICAL_HEIGHT) ||
			w > CANONICAL_WIDTH
		) {
			return normalizeFrame(src);
		}
		try {
			return await upscale(src, x0, y0, w, h);
		} catch {
			failed = true;
			return normalizeFrame(src);
		}
	}

	async function upscale(
		src: Mat,
		x0: number,
		y0: number,
		w: number,
		h: number,
	): Promise<Mat> {
		const key = `${w}x${h}`;
		if (tablesKey !== key) {
			let tables = tablesByShape.get(key);
			if (!tables) {
				tables = new Int32Array([
					...cubicTable(w, CANONICAL_WIDTH),
					...cubicTable(h, CANONICAL_HEIGHT),
				]);
				tablesByShape.set(key, tables);
			}
			tablesBuffer?.destroy();
			tablesBuffer = device.createBuffer({
				size: tables.byteLength,
				usage: BUFFER_STORAGE | BUFFER_COPY_DST,
			});
			device.queue.writeBuffer(tablesBuffer, 0, tables);
			tablesKey = key;
		}
		const srcData = src.data as Uint8Array;
		if (!srcBuffer || srcBuffer.size < srcData.byteLength) {
			srcBuffer?.destroy();
			srcBuffer = device.createBuffer({
				size: srcData.byteLength,
				usage: BUFFER_STORAGE | BUFFER_COPY_DST,
			});
		}
		device.queue.writeBuffer(srcBuffer, 0, srcData);
		device.queue.writeBuffer(
			paramsBuffer,
			0,
			new Uint32Array([
				src.cols,
				x0,
				y0,
				w,
				h,
				CANONICAL_WIDTH,
				CANONICAL_HEIGHT,
				0,
			]),
		);
		// an invalid submit would still map the read buffer, stale: check it
		device.pushErrorScope("validation");
		const encoder = device.createCommandEncoder();
		const pass = encoder.beginComputePass();
		pass.setPipeline(pipeline);
		pass.setBindGroup(
			0,
			device.createBindGroup({
				layout: pipeline.getBindGroupLayout(0),
				entries: [srcBuffer, tablesBuffer!, dstBuffer, paramsBuffer].map(
					(buffer, binding) => ({ binding, resource: { buffer } }),
				),
			}),
		);
		const groups = Math.ceil(
			(CANONICAL_WIDTH * CANONICAL_HEIGHT) / WORKGROUP_SIZE,
		);
		pass.dispatchWorkgroups(
			Math.min(groups, MAX_DISPATCH_X),
			Math.ceil(groups / MAX_DISPATCH_X),
		);
		pass.end();
		encoder.copyBufferToBuffer(dstBuffer, 0, readBuffer, 0, dstBytes);
		device.queue.submit([encoder.finish()]);
		const submitError = await device.popErrorScope();
		if (submitError) throw new Error(`scaler: ${submitError.message}`);
		await readBuffer.mapAsync(MAP_MODE_READ);
		const cv = getCV();
		const dst = new cv.Mat(CANONICAL_HEIGHT, CANONICAL_WIDTH, cv.CV_8UC4);
		dst.data.set(new Uint8Array(readBuffer.getMappedRange()));
		readBuffer.unmap();
		return dst;
	}

	return { normalize };
}

/**
 * OpenCV's cubic resize table for one axis: per destination index the source
 * index `floor(fx)` and four fixed-point weights, with OpenCV's f32 math.
 */
function cubicTable(srcSize: number, dstSize: number): number[] {
	const f = Math.fround;
	const scale = 1 / (dstSize / srcSize);
	const table: number[] = [];
	for (let d = 0; d < dstSize; d++) {
		let fx = f((d + 0.5) * scale - 0.5);
		const sx = Math.floor(fx);
		fx = f(fx - sx);
		const A = f(-0.75);
		const x1 = f(fx + 1);
		const c0 = f(
			f(f(f(f(f(A * x1) - f(5 * A)) * x1) + f(8 * A)) * x1) - f(4 * A),
		);
		const c1 = f(f(f(f(f(f(A + 2) * fx) - f(A + 3)) * fx) * fx) + 1);
		const omx = f(1 - fx);
		const c2 = f(f(f(f(f(f(A + 2) * omx) - f(A + 3)) * omx) * omx) + 1);
		const c3 = f(f(f(1 - c0) - c1) - c2);
		table.push(
			sx,
			...[c0, c1, c2, c3].map((c) =>
				Math.max(-32768, Math.min(32767, roundHalfEven(f(c * COEF_SCALE)))),
			),
		);
	}
	return table;
}

/** lrint in the default rounding mode, as OpenCV's cvRound compiles under clang */
function roundHalfEven(v: number): number {
	const r = Math.round(v);
	return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}
