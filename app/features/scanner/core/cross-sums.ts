/**
 * Exact template-match cross sums in WebAssembly SIMD (cross-sums.c, compiled
 * to a wasm32 object; regeneration steps there): for every placement of a
 * window, the sum of template·image products over all channels, ~10x the
 * speed of the same loop in JS. Null where WebAssembly SIMD is unavailable.
 */

/** cross-sums.c compiled with clang --target=wasm32 -O3 -msimd128, base64 */
const CROSS_SUMS_WASM =
	"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";

const PAGE_BYTES = 65536;

interface Pixels {
	rows: number;
	cols: number;
	ch: number;
	data: Uint8Array;
}

export interface CrossSums {
	/**
	 * Cross sums of `template` against `image` for placements x in [lo, hi] of
	 * every row: entry (y · (hi − lo + 1) + x − lo). A view into the module's
	 * memory, valid until the next call.
	 */
	compute(image: Pixels, template: Pixels, lo: number, hi: number): Uint32Array;
}

let loaded: CrossSums | null | undefined;

/** The SIMD kernel, instantiated on first use; null when this runtime cannot run it. */
export function simdCrossSums(): CrossSums | null {
	if (loaded !== undefined) return loaded;
	try {
		const memory = new WebAssembly.Memory({ initial: 1 });
		const instance = new WebAssembly.Instance(
			new WebAssembly.Module(
				Uint8Array.from(atob(CROSS_SUMS_WASM), (c) => c.charCodeAt(0)),
			),
			{
				env: {
					__linear_memory: memory,
					__indirect_function_table: new WebAssembly.Table({
						initial: 0,
						element: "anyfunc",
					}),
				},
			},
		);
		const crossSums = instance.exports.crossSums as (...args: number[]) => void;
		loaded = {
			compute(image, template, lo, hi) {
				const rows = image.rows - template.rows + 1;
				const width = hi - lo + 1;
				const templateOffset = align(image.data.length);
				const outOffset = align(templateOffset + template.data.length);
				const end = outOffset + rows * width * 4;
				if (end > memory.buffer.byteLength) {
					memory.grow(Math.ceil((end - memory.buffer.byteLength) / PAGE_BYTES));
				}
				const bytes = new Uint8Array(memory.buffer);
				bytes.set(image.data, 0);
				bytes.set(template.data, templateOffset);
				crossSums(
					0,
					image.cols * image.ch,
					templateOffset,
					template.rows,
					template.cols * template.ch,
					rows,
					lo,
					hi,
					image.ch,
					outOffset,
				);
				return new Uint32Array(memory.buffer, outOffset, rows * width);
			},
		};
	} catch {
		loaded = null;
	}
	return loaded;
}

function align(offset: number): number {
	return Math.ceil(offset / 16) * 16;
}
