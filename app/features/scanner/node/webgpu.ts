/**
 * WebGPU for the Node scripts: Dawn from the `webgpu` npm package, which is
 * deliberately not a repo dependency (a native binary nothing ships with) —
 * install it anywhere (`npm i webgpu` in a scratch dir) and point
 * WEBGPU_NODE at its package dir. Load OpenCV first: in a plain Node process
 * the two crashed together, under vite-node they coexist.
 */
import { createRequire } from "node:module";

let instance: GPU | null = null;

/** Dawn's `navigator.gpu` equivalent; throws when WEBGPU_NODE is unset. */
export function nodeGpu(): GPU {
	if (instance) return instance;
	const dir = process.env.WEBGPU_NODE;
	if (!dir) {
		throw new Error(
			"set WEBGPU_NODE to an installed `webgpu` package dir (npm i webgpu)",
		);
	}
	const { create, globals } = createRequire(import.meta.url)(dir) as {
		create: (flags: string[]) => GPU;
		globals: Record<string, unknown>;
	};
	Object.assign(globalThis, globals);
	// a module-level reference: Dawn tears the adapter down (and Node
	// segfaults mid-run) once the instance is garbage-collected
	instance = create([]);
	return instance;
}
