/**
 * Per-row and per-column R+G+B sums of an RGBA picture on the GPU: all
 * detectContentBox reads, so the readback can look for bars without mapping
 * the full-size picture.
 */
const WORKGROUP_SIZE = 64;
const BUFFER_MAP_READ = 0x0001;
const BUFFER_COPY_SRC = 0x0004;
const BUFFER_COPY_DST = 0x0008;
const BUFFER_UNIFORM = 0x0040;
const BUFFER_STORAGE = 0x0080;
const MAP_MODE_READ = 0x0001;

const SHADER = /* wgsl */ `
struct Params { stride: u32, w: u32, h: u32, _pad: u32 };

@group(0) @binding(0) var<storage, read> src: array<u32>;
@group(0) @binding(1) var<storage, read_write> dst: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;

fn rgb(p: u32) -> u32 {
  return (p & 0xffu) + ((p >> 8u) & 0xffu) + ((p >> 16u) & 0xffu);
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  var sum = 0u;
  if (i < params.h) {
    for (var x = 0u; x < params.w; x++) { sum += rgb(src[i * params.stride + x]); }
  } else if (i < params.h + params.w) {
    let x = i - params.h;
    for (var y = 0u; y < params.h; y++) { sum += rgb(src[y * params.stride + x]); }
  } else {
    return;
  }
  dst[i] = sum;
}
`;

/** Read-back line sums: `rows[y]` and `cols[x]` are R+G+B over that line. */
export interface LineSums {
	rows: Uint32Array;
	cols: Uint32Array;
}

export interface LineSumsKernel {
	/**
	 * Records the line sums of the `w`×`h` RGBA in `src` (`stride` pixels a
	 * row) into `encoder`; once submitted, `read` maps them.
	 */
	encode(
		encoder: GPUCommandEncoder,
		src: GPUBuffer,
		{ stride, w, h }: { stride: number; w: number; h: number },
	): { read: () => Promise<LineSums> };
}

export async function createLineSumsKernel(
	device: GPUDevice,
): Promise<LineSumsKernel> {
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
		throw new Error(`line sums pipeline: ${pipelineError.message}`);
	}
	interface Slot {
		params: GPUBuffer;
		dst: GPUBuffer;
		read: GPUBuffer;
	}
	/** per picture size: slots not in use */
	const free = new Map<string, Slot[]>();
	return {
		encode(encoder, src, { stride, w, h }) {
			const key = `${w}x${h}`;
			const bytes = (w + h) * 4;
			const slots = free.get(key) ?? [];
			free.set(key, slots);
			const slot = slots.pop() ?? {
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
				new Uint32Array([stride, w, h, 0]),
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
			pass.dispatchWorkgroups(Math.ceil((w + h) / WORKGROUP_SIZE));
			pass.end();
			encoder.copyBufferToBuffer(slot.dst, 0, slot.read, 0, bytes);
			return {
				async read() {
					try {
						await slot.read.mapAsync(MAP_MODE_READ);
						const sums = new Uint32Array(slot.read.getMappedRange().slice(0));
						slot.read.unmap();
						return { rows: sums.subarray(0, h), cols: sums.subarray(h) };
					} finally {
						slots.push(slot);
					}
				},
			};
		},
	};
}
