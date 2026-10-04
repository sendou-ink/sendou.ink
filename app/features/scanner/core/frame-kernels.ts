/**
 * In-place frame conversions in WebAssembly SIMD (frame-kernels.c, compiled
 * to a wasm32 object; regeneration steps there), bit-identical to OpenCV's
 * cvtColor at about half its cost. The module runs on OpenCV's own memory
 * (cv.wasmMemory, exposed by the opencv-js patch), so Mat data is read and
 * written where it lies. Null where WebAssembly SIMD or the memory is
 * unavailable; callers then use cvtColor.
 */
import { getCV, type Mat } from "./cv";

/** frame-kernels.c compiled with clang --target=wasm32 -O3 -msimd128, base64 */
const FRAME_KERNELS_WASM =
	"AGFzbQEAAAABh4CAgAABYAN/f38AArqAgIAAAgNlbnYPX19saW5lYXJfbWVtb3J5AgAAA2VudhlfX2luZGlyZWN0X2Z1bmN0aW9uX3RhYmxlAXAAAAODgICAAAIAAAeagICAAAIKcmdiYVRvR3JheQAACXJnYmFUb1JnYgABCuSMgIAAAowKBAN/BHsDfwJ7QQAhAwJAIAJBEEkNAEEAIQQgACEFA0AgASAEaiAF/QAAACIG/YkB/QxGJiNLlw4AAEYmI0uXDgAAIgf9ugEiCCAG/YoBIAf9ugEiBv0NBAUGBwwNDg8UFRYXHB0eHyAIIAb9DQABAgMICQoLEBESExgZGhv9rgH9DABAAAAAQAAAAEAAAABAAAAiBv2uAUEP/a0BIAVBEGr9AAAAIgj9iQEgB/26ASIJIAj9igEgB/26ASII/Q0EBQYHDA0ODxQVFhccHR4fIAkgCP0NAAECAwgJCgsQERITGBkaG/2uASAG/a4BQQ/9rQH9hgEgBUEgav0AAAAiCP2JASAH/boBIgkgCP2KASAH/boBIgj9DQQFBgcMDQ4PFBUWFxwdHh8gCSAI/Q0AAQIDCAkKCxAREhMYGRob/a4BIAb9rgFBD/2tASAFQTBq/QAAACII/YkBIAf9ugEiCSAI/YoBIAf9ugEiB/0NBAUGBwwNDg8UFRYXHB0eHyAJIAf9DQABAgMICQoLEBESExgZGhv9rgEgBv2uAUEP/a0B/YYB/Wb9CwAAIAVBwABqIQUgBEEgaiEKIARBEGoiAyEEIAogAk0NAAsLAkAgAiADTQ0AAkAgAiADayILQRBNDQAgACADQQJ0aiEFAkAgASADaiIEIAAgAkECdGpBf2pPDQAgBSABIAJqSQ0BCyACQQ9xIgpBECAKGyIMIANqIAJrIQogAyALIAxraiEDA0AgBCAF/QAAACIIIAf9DQAECAwAAAAAAAAAAAAAAAD9iQH9qQH9DEYmAABGJgAARiYAAEYmAAAiB/21ASAIIAf9DQEFCQ0AAAAAAAAAAAAAAAD9iQH9qQH9DCNLAAAjSwAAI0sAACNLAAAiBv21Af2uASAIIAf9DQIGCg4AAAAAAAAAAAAAAAD9iQH9qQH9DJcOAACXDgAAlw4AAJcOAAAiCP21Af2uAf0MAEAAAABAAAAAQAAAAEAAACIJ/a4BQQ/9rQH9DP8AAAD/AAAA/wAAAP8AAAAiDf1OIAX9AAAQIg4gB/0NAAQIDAAAAAAAAAAAAAAAAP2JAf2pASAH/bUBIA4gB/0NAQUJDQAAAAAAAAAAAAAAAP2JAf2pASAG/bUB/a4BIA4gB/0NAgYKDgAAAAAAAAAAAAAAAP2JAf2pASAI/bUB/a4BIAn9rgFBD/2tASAN/U79hgEgBf0AACAiDiAH/Q0ABAgMAAAAAAAAAAAAAAAA/YkB/akBIAf9tQEgDiAH/Q0BBQkNAAAAAAAAAAAAAAAA/YkB/akBIAb9tQH9rgEgDiAH/Q0CBgoOAAAAAAAAAAAAAAAA/YkB/akBIAj9tQH9rgEgCf2uAUEP/a0BIA39TiAF/QAAMCIOIAf9DQAECAwAAAAAAAAAAAAAAAD9iQH9qQEgB/21ASAOIAf9DQEFCQ0AAAAAAAAAAAAAAAD9iQH9qQEgBv21Af2uASAOIAf9DQIGCg4AAAAAAAAAAAAAAAD9iQH9qQEgCP21Af2uASAJ/a4BQQ/9rQEgDf1O/YYB/Wb9CwAAIAVBwABqIQUgBEEQaiEEIApBEGoiCg0ACwsgASADaiEEIAIgA2shCiAAIANBAnRqIQUDQCAEIAUtAABBxswAbCAFQQFqLQAAQaOWAWxqIAVBAmotAABBlx1sakGAgAFqQQ92OgAAIAVBBGohBSAEQQFqIQQgCkF/aiIKDQALCwvTAgIDfwF7QQYhA0EAIQQCQCACQQZJDQAgACEFIAEhBANAIAQgBf0AAAAiBiAG/Q0AAQIEBQYICQoMDQ4AAAAA/QsAACAFQRBqIQUgBEEMaiEEIANBBGoiAyACTQ0ACyADQXpqIQQLAkAgAiAETQ0AIARBAWohBQJAIAIgBGtBAXFFDQAgASAEQQNsaiIDIAAgBEECdGoiBC0AADoAACADQQFqIAQtAAE6AAAgA0ECaiAELQACOgAAIAUhBAsgAiAFRg0AIAIgBGshAyAAIARBAnRqIQUgASAEQQNsaiEEA0AgBCAFLQAAOgAAIARBAWogBUEBai0AADoAACAEQQJqIAVBAmotAAA6AAAgBEEDaiAFQQRqLQAAOgAAIARBBGogBUEFai0AADoAACAEQQVqIAVBBmotAAA6AAAgBUEIaiEFIARBBmohBCADQX5qIgMNAAsLCwCxgICAAAdsaW5raW5nAgiigICAAAMApAEACnJnYmFUb0dyYXkApAEBCXJnYmFUb1JnYgWQAQAAwICAgAAJcHJvZHVjZXJzAQxwcm9jZXNzZWQtYnkBC0FwcGxlIGNsYW5nGjIxLjAuMCAoY2xhbmctMjEwMC4zLjM0LjIpAJ2BgIAAD3RhcmdldF9mZWF0dXJlcwkrC2J1bGstbWVtb3J5Kw9idWxrLW1lbW9yeS1vcHQrFmNhbGwtaW5kaXJlY3Qtb3ZlcmxvbmcrCm11bHRpdmFsdWUrD211dGFibGUtZ2xvYmFscysTbm9udHJhcHBpbmctZnB0b2ludCsPcmVmZXJlbmNlLXR5cGVzKwhzaWduLWV4dCsHc2ltZDEyOA==";

export interface FrameKernels {
	/** cvtColor(src, dst, COLOR_RGBA2GRAY) for a continuous CV_8UC4 `src` */
	rgbaToGray(src: Mat): Mat;
	/** cvtColor(src, dst, COLOR_RGBA2RGB) for a continuous CV_8UC4 `src` */
	rgbaToRgb(src: Mat): Mat;
}

let loaded: FrameKernels | null | undefined;

/** The kernels, instantiated on first use; null when this runtime cannot run them. */
export function frameKernels(): FrameKernels | null {
	if (loaded !== undefined) return loaded;
	const cv = getCV();
	const memory = (cv as unknown as { wasmMemory?: WebAssembly.Memory })
		.wasmMemory;
	try {
		if (!memory) throw new Error("OpenCV memory not exposed");
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
		const convert =
			(name: string, type: number) =>
			(src: Mat): Mat => {
				const dst = new cv.Mat(src.rows, src.cols, type);
				(exports[name] as (src: number, dst: number, n: number) => void)(
					(src.data as Uint8Array).byteOffset,
					(dst.data as Uint8Array).byteOffset,
					src.rows * src.cols,
				);
				return dst;
			};
		loaded = {
			rgbaToGray: convert("rgbaToGray", cv.CV_8UC1),
			rgbaToRgb: convert("rgbaToRgb", cv.CV_8UC3),
		};
	} catch {
		loaded = null;
	}
	return loaded;
}
