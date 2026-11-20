/**
 * Packs the gate ROI pixels (core/gate-rois.ts) of a canonical RGBA picture
 * into one small buffer on the GPU, in `GateRois.gather`'s layout, so a frame
 * every gate is expected to fail on maps back a fifth of its pixels.
 */
import { CANONICAL_WIDTH } from "../core/canonical";
import * as GateRois from "../core/gate-rois";

const WORKGROUP_SIZE = 64;
const MAX_DISPATCH_X = 65535;
const BUFFER_MAP_READ = 0x0001;
const BUFFER_COPY_SRC = 0x0004;
const BUFFER_COPY_DST = 0x0008;
const BUFFER_UNIFORM = 0x0040;
const BUFFER_STORAGE = 0x0080;
const MAP_MODE_READ = 0x0001;

const SHADER = /* wgsl */ `
@group(0) @binding(0) var<storage, read> src: array<u32>;
@group(0) @binding(1) var<storage, read> pixels: array<u32>;
@group(0) @binding(2) var<storage, read_write> dst: array<u32>;
@group(0) @binding(3) var<uniform> params: vec4<u32>;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
  let i = gid.x + gid.y * nwg.x * ${WORKGROUP_SIZE}u;
  if (i >= params.y) { return; }
  let p = pixels[i];
  dst[i] = src[(p / ${CANONICAL_WIDTH}u) * params.x + p % ${CANONICAL_WIDTH}u];
}
`;

export interface GatherKernel {
	/**
	 * Records the packing of the canonical RGBA in `src` (`stride` pixels a
	 * row) into `encoder`; once submitted, `read` maps it.
	 */
	encode(
		encoder: GPUCommandEncoder,
		src: GPUBuffer,
		stride: number,
	): { read: () => Promise<Uint8Array> };
}

export async function createGatherKernel(
	device: GPUDevice,
	spans: GateRois.GateSpans,
): Promise<GatherKernel> {
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
		throw new Error(`gather pipeline: ${pipelineError.message}`);
	}
	const count = GateRois.pixelCount(spans);
	const offsets = new Uint32Array(count);
	let i = 0;
	for (let s = 0; s < spans.length; s += 3) {
		const start = spans[s]! * CANONICAL_WIDTH + spans[s + 1]!;
		for (let x = 0; x < spans[s + 2]!; x++) offsets[i++] = start + x;
	}
	const table = device.createBuffer({
		size: offsets.byteLength,
		usage: BUFFER_STORAGE | BUFFER_COPY_DST,
	});
	device.queue.writeBuffer(table, 0, offsets);
	const bytes = count * 4;
	interface Slot {
		params: GPUBuffer;
		dst: GPUBuffer;
		read: GPUBuffer;
	}
	const free: Slot[] = [];
	return {
		encode(encoder, src, stride) {
			const slot = free.pop() ?? {
				params: device.createBuffer({
					size: 16,
					usage: BUFFER_UNIFORM | BUFFER_COPY_DST,
				}),
				dst: device.createBuffer({
					size: bytes,
					usage: BUFFER_STORAGE | BUFFER_COPY_SRC,
				}),
				read: device.createBuffer({
					size: bytes,
					usage: BUFFER_MAP_READ | BUFFER_COPY_DST,
				}),
			};
			device.queue.writeBuffer(
				slot.params,
				0,
				new Uint32Array([stride, count, 0, 0]),
			);
			const pass = encoder.beginComputePass();
			pass.setPipeline(pipeline);
			pass.setBindGroup(
				0,
				device.createBindGroup({
					layout: pipeline.getBindGroupLayout(0),
					entries: [src, table, slot.dst, slot.params].map(
						(buffer, binding) => ({ binding, resource: { buffer } }),
					),
				}),
			);
			const groups = Math.ceil(count / WORKGROUP_SIZE);
			pass.dispatchWorkgroups(
				Math.min(groups, MAX_DISPATCH_X),
				Math.ceil(groups / MAX_DISPATCH_X),
			);
			pass.end();
			encoder.copyBufferToBuffer(slot.dst, 0, slot.read, 0, bytes);
			return {
				async read() {
					try {
						await slot.read.mapAsync(MAP_MODE_READ);
						const packed = new Uint8Array(slot.read.getMappedRange().slice(0));
						slot.read.unmap();
						return packed;
					} finally {
						free.push(slot);
					}
				},
			};
		},
	};
}
