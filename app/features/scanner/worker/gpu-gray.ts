/**
 * RGBA2GRAY of a canonical frame on the GPU, bit-identical to OpenCV's
 * 8-bit cvtColor (its 15-bit fixed point, as frame-kernels.c): computed
 * where the readback already holds the picture, so the analyzer starts its
 * gates with the conversion done.
 */
import { CANONICAL_HEIGHT, CANONICAL_WIDTH } from "../core/canonical";

const WORKGROUP_SIZE = 64;
const MAX_DISPATCH_X = 65535;
const BUFFER_MAP_READ = 0x0001;
const BUFFER_COPY_SRC = 0x0004;
const BUFFER_COPY_DST = 0x0008;
const BUFFER_UNIFORM = 0x0040;
const BUFFER_STORAGE = 0x0080;
const GRAY_BYTES = CANONICAL_WIDTH * CANONICAL_HEIGHT;

const SHADER = /* wgsl */ `
@group(0) @binding(0) var<storage, read> src: array<u32>;
@group(0) @binding(1) var<storage, read_write> dst: array<u32>;
@group(0) @binding(2) var<uniform> stride: vec4<u32>;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
  let i = gid.x + gid.y * nwg.x * ${WORKGROUP_SIZE}u;
  if (i >= ${GRAY_BYTES / 4}u) { return; }
  let x = (i * 4u) % ${CANONICAL_WIDTH}u;
  let y = (i * 4u) / ${CANONICAL_WIDTH}u;
  var out = 0u;
  for (var k = 0u; k < 4u; k++) {
    let p = src[y * stride.x + x + k];
    let v = ((p & 0xffu) * 9798u + ((p >> 8u) & 0xffu) * 19235u + ((p >> 16u) & 0xffu) * 3735u + 16384u) >> 15u;
    out |= v << (8u * k);
  }
  dst[i] = out;
}
`;

export interface GrayKernel {
	/**
	 * Records the gray of the canonical RGBA in `src` (`stride` pixels a row)
	 * into `encoder`; once submitted it maps from the returned buffer, which
	 * goes back with `release` after reading.
	 */
	encode(encoder: GPUCommandEncoder, src: GPUBuffer, stride: number): GPUBuffer;
	release(read: GPUBuffer): void;
}

export async function createGrayKernel(device: GPUDevice): Promise<GrayKernel> {
	device.pushErrorScope("validation");
	const pipeline = device.createComputePipeline({
		layout: "auto",
		compute: {
			module: device.createShaderModule({ code: SHADER }),
			entryPoint: "main",
		},
	});
	const pipelineError = await device.popErrorScope();
	if (pipelineError) throw new Error(`gray pipeline: ${pipelineError.message}`);
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
					size: GRAY_BYTES,
					usage: BUFFER_STORAGE | BUFFER_COPY_SRC,
				}),
				read: device.createBuffer({
					size: GRAY_BYTES,
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
			const groups = Math.ceil(GRAY_BYTES / 4 / WORKGROUP_SIZE);
			pass.dispatchWorkgroups(
				Math.min(groups, MAX_DISPATCH_X),
				Math.ceil(groups / MAX_DISPATCH_X),
			);
			pass.end();
			encoder.copyBufferToBuffer(slot.dst, 0, slot.read, 0, GRAY_BYTES);
			return slot.read;
		},
		release(read) {
			const slot = busy.get(read);
			if (!slot) return;
			busy.delete(read);
			free.push(slot);
		},
	};
}
