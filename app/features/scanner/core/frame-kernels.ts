/**
 * Whole-frame conversions and resizes in WebAssembly (frame-kernels.c,
 * compiled to a wasm32 object with SIMD; regeneration steps there),
 * bit-identical to OpenCV's cvtColor and resize: core/image.ts and
 * core/resize.ts hand them OpenCV's tables and run the same loops in JS
 * where the kernels cannot run. The module has a memory of its own: a frame
 * is copied in and the result out, still 2-5x faster than the JS loops.
 * Null where WebAssembly SIMD is unavailable.
 */
import type { Image } from "./image";

/** frame-kernels.c compiled with clang --target=wasm32 -O3 -msimd128, base64 */
const FRAME_KERNELS_WASM =
	"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Iir9iQEgFv0AAAAiK/2JAf2OASAo/QAAACIs/YkB/Y4BICb9AAAAIi39iQH9jgH9DAIAAgACAAIAAgACAAIAAgAiLv2OAUEC/Y0B/Qz/AP8A/wD/AP8A/wD/AP8AIi/9TiAq/YoBICv9igH9jgEgLP2KAf2OASAt/YoB/Y4BIC79jgFBAv2NASAv/U79Zv0LAAAgAUEQaiEBIBZBEGohFiAmQRBqISYgKEEQaiEoICdBEGohJyApQXBqIikNAAsgCyEBIAYgC0YNAQsDQCAjIAFqIB8gAWotAAAgICABai0AAGogIiABai0AAGogISABai0AAGpBAmpBAnY6AAAgBiABQQFqIgFHDQALCyAfIAhqIR8gICAIaiEgICEgCGohISAiIAhqISIgIyAGaiEjICRBAWohJCAlIAZqIiUgBUkNAAsgEiAHaiESIBMgB2ohEyAQIAdqIRAgFCAHaiEUIBUgA2ohFSARQQFqIhEgBEcNAAwCCwsgACAGaiEkIAAgAWohCyAAIAYgAWpqIRdBACEYA0AgACEfICQhICAXISEgCyEiIAIhI0EAISUDQCAfIQEgICEWICEhJiAiISggIyEnIAYhKQNAICcgAS0AACAWLQAAaiAoLQAAaiAmLQAAakECakECdjoAACABQQFqIQEgFkEBaiEWICZBAWohJiAoQQFqISggJ0EBaiEnIClBf2oiKQ0ACyAfIAhqIR8gICAIaiEgICEgCGohISAiIAhqISIgIyAGaiEjICUgBmoiJSAFSQ0ACyAAIAdqIQAgJCAHaiEkIBcgB2ohFyALIAdqIQsgAiADaiECIBhBAWoiGCAERw0ACwsL4wEBCH8CQCACRQ0AA0AgBCAALQAAIgUgAEEBai0AACIGIAUgBksbIgcgAEECai0AACIIIAcgCEsbIgcgBSAGIAUgBkkbIgkgCCAJIAhJG2siCUECdCIKaigCACELIAMgB0ECdGooAgAhDCABQQJqIAc6AAAgAUEBaiAJIAxsQYAQakEMdjoAACABIAsgBiAIayAIIAVrIAlBAXRqIAUgBmsgCmogByAGRhsgByAFRhtsIgVBgBBqQQx2QbQBQYBwIAVBgHBIG2o6AAAgAEEDaiEAIAFBA2ohASACQX9qIgINAAsLCwDwgICAAAdsaW5raW5nAgjhgICAAAcApAEACnJnYmFUb0dyYXkApAEBCXJnYmFUb1JnYgCkAQIKcmVzaXplQXJlYQCkAQMPcmVzaXplU2VwYXJhYmxlAKQBBApyZXNpemVIYWxmAKQBBQhyZ2JUb0hzdgWQAQAAv4CAgAAJcHJvZHVjZXJzAQxwcm9jZXNzZWQtYnkBC0FwcGxlIGNsYW5nGTIxLjAuMCAoY2xhbmctMjEwMC40LjEuMSkAnYGAgAAPdGFyZ2V0X2ZlYXR1cmVzCSsLYnVsay1tZW1vcnkrD2J1bGstbWVtb3J5LW9wdCsWY2FsbC1pbmRpcmVjdC1vdmVybG9uZysKbXVsdGl2YWx1ZSsPbXV0YWJsZS1nbG9iYWxzKxNub250cmFwcGluZy1mcHRvaW50Kw9yZWZlcmVuY2UtdHlwZXMrCHNpZ24tZXh0KwdzaW1kMTI4";

const PAGE_BYTES = 65536;

/** A resize's coefficient tables (core/resize.ts builds them) */
export interface AreaTaps {
	length: number;
	di: Int32Array;
	si: Int32Array;
	alpha: Float32Array;
}

interface SeparableTaps {
	/** 2 (linear) or 4 (cubic) */
	ksize: number;
	/** per destination element: the source element of each tap */
	tapAt: Int32Array;
	tapWeight: Int32Array;
	/** per destination row: the (clipped) source row of each tap */
	rowsOf: Int32Array;
	yWeight: Int32Array;
}

interface FrameKernels {
	/** COLOR_RGBA2GRAY of an RGBA image */
	rgbaToGray(src: Image): Image;
	/** COLOR_RGBA2RGB of an RGBA image */
	rgbaToRgb(src: Image): Image;
	/** resizeArea_ onto `dst` (same channels) */
	resizeArea(src: Image, dst: Image, x: AreaTaps, y: AreaTaps): void;
	/** resizeGeneric_ onto `dst` (same channels) */
	resizeSeparable(src: Image, dst: Image, taps: SeparableTaps): void;
	/** resizeAreaFast_ at 2x2 for `rows` rows of `whole` elements of `dst` */
	resizeHalf(src: Image, dst: Image, rows: number, whole: number): void;
	/** COLOR_RGB2HSV of an RGB image onto `dst`, with OpenCV's division tables */
	rgbToHsv(src: Image, dst: Image, sdiv: Int32Array, hdiv: Int32Array): void;
}

let loaded: FrameKernels | null | undefined;

/** The kernels, instantiated on first use; null when this runtime cannot run them. */
export function frameKernels(): FrameKernels | null {
	if (loaded !== undefined) return loaded;
	try {
		const memory = new WebAssembly.Memory({ initial: 1 });
		const { exports } = new WebAssembly.Instance(
			new WebAssembly.Module(
				Uint8Array.from(atob(FRAME_KERNELS_WASM), (c) => c.charCodeAt(0)),
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
		const kernel = (name: string) =>
			exports[name] as (...args: number[]) => void;
		/** Lays `parts` (byte lengths) out in the memory, growing it; offsets in bytes. */
		const layout = (...parts: number[]): number[] => {
			let end = 0;
			const offsets = parts.map((bytes) => {
				const offset = end;
				// 16 spare bytes: SIMD stores may run past the last element
				end = Math.ceil((offset + bytes + 16) / 16) * 16;
				return offset;
			});
			if (end > memory.buffer.byteLength) {
				memory.grow(Math.ceil((end - memory.buffer.byteLength) / PAGE_BYTES));
			}
			return offsets;
		};
		const write = (
			offset: number,
			array: Uint8Array | Int32Array | Float32Array,
		) => {
			new Uint8Array(memory.buffer).set(
				new Uint8Array(array.buffer, array.byteOffset, array.byteLength),
				offset,
			);
		};
		const read = (offset: number, into: Image) => {
			into.data.set(new Uint8Array(memory.buffer, offset, into.data.length));
		};
		const convert =
			(name: string, channels: number) =>
			(src: Image): Image => {
				const n = src.rows * src.cols;
				const [srcAt, dstAt] = layout(n * 4, n * channels);
				write(srcAt!, src.data);
				kernel(name)(srcAt!, dstAt!, n);
				const out = {
					rows: src.rows,
					cols: src.cols,
					channels,
					data: new Uint8Array(n * channels),
				};
				read(dstAt!, out);
				return out;
			};
		loaded = {
			rgbaToGray: convert("rgbaToGray", 1),
			rgbaToRgb: convert("rgbaToRgb", 3),
			resizeArea(src, dst, x, y) {
				const width = dst.cols * dst.channels;
				const at = layout(
					src.data.length,
					dst.data.length,
					x.length * 4,
					x.length * 4,
					x.length * 4,
					y.length * 4,
					y.length * 4,
					y.length * 4,
					width * 4,
					width * 4,
				);
				const parts = [
					src.data,
					null,
					x.di,
					x.si,
					x.alpha,
					y.di,
					y.si,
					y.alpha,
				];
				for (const [i, part] of parts.entries()) if (part) write(at[i]!, part);
				kernel("resizeArea")(
					at[0]!,
					src.cols * src.channels,
					at[1]!,
					width,
					src.channels,
					at[2]!,
					at[3]!,
					at[4]!,
					x.length,
					at[5]!,
					at[6]!,
					at[7]!,
					y.length,
					at[8]!,
					at[9]!,
				);
				read(at[1]!, dst);
			},
			resizeSeparable(src, dst, taps) {
				const width = dst.cols * dst.channels;
				const at = layout(
					src.data.length,
					dst.data.length,
					taps.tapAt.byteLength,
					taps.tapWeight.byteLength,
					taps.rowsOf.byteLength,
					taps.yWeight.byteLength,
					2 * taps.ksize * width * 4,
					2 * taps.ksize * 4,
				);
				const parts = [
					src.data,
					null,
					taps.tapAt,
					taps.tapWeight,
					taps.rowsOf,
					taps.yWeight,
				];
				for (const [i, part] of parts.entries()) if (part) write(at[i]!, part);
				kernel("resizeSeparable")(
					at[0]!,
					src.cols * src.channels,
					at[1]!,
					width,
					dst.rows,
					taps.ksize,
					at[2]!,
					at[3]!,
					at[4]!,
					at[5]!,
					at[6]!,
					at[7]!,
				);
				read(at[1]!, dst);
			},
			resizeHalf(src, dst, rows, whole) {
				const width = dst.cols * dst.channels;
				const [srcAt, dstAt] = layout(src.data.length, dst.data.length);
				write(srcAt!, src.data);
				kernel("resizeHalf")(
					srcAt!,
					src.cols * src.channels,
					dstAt!,
					width,
					rows,
					whole,
					src.channels,
				);
				read(dstAt!, dst);
			},
			rgbToHsv(src, dst, sdiv, hdiv) {
				const at = layout(
					src.data.length,
					dst.data.length,
					sdiv.byteLength,
					hdiv.byteLength,
				);
				write(at[0]!, src.data);
				write(at[2]!, sdiv);
				write(at[3]!, hdiv);
				kernel("rgbToHsv")(at[0]!, at[1]!, src.rows * src.cols, at[2]!, at[3]!);
				read(at[1]!, dst);
			},
		};
	} catch {
		loaded = null;
	}
	return loaded;
}
