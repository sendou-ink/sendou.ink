/**
 * OpenCV's INTER_AREA resize of an RGBA picture exactly twice the canonical
 * size (2160p) on the GPU, exactly: at a 2:1 ratio OpenCV averages each 2×2
 * block as `(Σ + 2) >> 2`, so the readback maps a quarter of the pixels and
 * the analyzer skips the CPU resize. Free of OpenCV, so the readback workers
 * run it too.
 */
import { CANONICAL_HEIGHT, CANONICAL_WIDTH } from "../core/canonical";

const WORKGROUP_SIZE = 64;
const MAX_DISPATCH_X = 65535;
const BUFFER_MAP_READ = 0x0001;
const BUFFER_COPY_SRC = 0x0004;
const BUFFER_COPY_DST = 0x0008;
const BUFFER_UNIFORM = 0x0040;
const BUFFER_STORAGE = 0x0080;
const DST_BYTES = CANONICAL_WIDTH * CANONICAL_HEIGHT * 4;

const SHADER = /* wgsl */ `
@group(0) @binding(0) var<storage, read> src: array<u32>;
@group(0) @binding(1) var<storage, read_write> dst: array<u32>;
@group(0) @binding(2) var<uniform> stride: vec4<u32>;

fn texel(x: u32, y: u32) -> vec4<u32> {
  let p = src[y * stride.x + x];
  return vec4<u32>(p & 0xffu, (p >> 8u) & 0xffu, (p >> 16u) & 0xffu, p >> 24u);
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
  let i = gid.x + gid.y * nwg.x * ${WORKGROUP_SIZE}u;
  if (i >= ${CANONICAL_WIDTH * CANONICAL_HEIGHT}u) { return; }
  let sx = (i % ${CANONICAL_WIDTH}u) * 2u;
  let sy = (i / ${CANONICAL_WIDTH}u) * 2u;
  let v = (texel(sx, sy) + texel(sx + 1u, sy) + texel(sx, sy + 1u) + texel(sx + 1u, sy + 1u) + vec4<u32>(2u)) >> vec4<u32>(2u);
  dst[i] = v.x | (v.y << 8u) | (v.z << 16u) | (v.w << 24u);
}
`;

export interface AreaDownscaler {
	/**
	 * Records the downscale of the RGBA in `src` (`stride` pixels a row) into
	 * `encoder`: the canonical RGBA in `canonical` for later passes, and once
	 * submitted mappable from `read`, which goes back with `release` after
	 * reading.
	 */
	encode(
		encoder: GPUCommandEncoder,
		src: GPUBuffer,
		stride: number,
	): { canonical: GPUBuffer; read: GPUBuffer };
	release(read: GPUBuffer): void;
}

/** Whether normalizeFrame resizes a `w`×`h` picture by exactly 2:1 INTER_AREA (the GPU's to do). */
export function halvesArea(w: number, h: number): boolean {
	return w === CANONICAL_WIDTH * 2 && h === CANONICAL_HEIGHT * 2;
}

/** The 2:1 area downscale kernel on `device`; calls may overlap. */
export async function createAreaDownscaler(
	device: GPUDevice,
): Promise<AreaDownscaler> {
	device.pushErrorScope("validation");
	const pipeline = device.createComputePipeline({
		layout: "auto",
		compute: {
			module: device.createShaderModule({ code: SHADER }),
			entryPoint: "main",
		},
	});
	const pipelineError = await device.popErrorScope();
	if (pipelineError) {
		throw new Error(`downscaler pipeline: ${pipelineError.message}`);
	}
	interface Slot {
		params: GPUBuffer;
		dst: GPUBuffer;
		read: GPUBuffer;
	}
	const free: Slot[] = [];
	const busy = new Map<GPUBuffer, Slot>();
	return {
		encode(encoder, src, stride) {
			const slot = free.pop() ?? {
				params: device.createBuffer({
					size: 16,
					usage: BUFFER_UNIFORM | BUFFER_COPY_DST,
				}),
				dst: device.createBuffer({
					size: DST_BYTES,
					usage: BUFFER_STORAGE | BUFFER_COPY_SRC,
				}),
				read: device.createBuffer({
					size: DST_BYTES,
					usage: BUFFER_MAP_READ | BUFFER_COPY_DST,
				}),
			};
			busy.set(slot.read, slot);
			device.queue.writeBuffer(
				slot.params,
				0,
				new Uint32Array([stride, 0, 0, 0]),
			);
			const pass = encoder.beginComputePass();
			pass.setPipeline(pipeline);
			pass.setBindGroup(
				0,
				device.createBindGroup({
					layout: pipeline.getBindGroupLayout(0),
					entries: [src, slot.dst, slot.params].map((buffer, binding) => ({
						binding,
						resource: { buffer },
					})),
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
			encoder.copyBufferToBuffer(slot.dst, 0, slot.read, 0, DST_BYTES);
			return { canonical: slot.dst, read: slot.read };
		},
		release(read) {
			const slot = busy.get(read);
			if (!slot) return;
			busy.delete(read);
			free.push(slot);
		},
	};
}
