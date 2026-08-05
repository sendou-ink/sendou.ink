/**
 * OpenCV.js singleton loader. Works in Node, browser main thread, and workers —
 * the UMD bundle embeds its WASM, so no asset paths are involved.
 *
 * Everything in core/ obtains the cv namespace through getCV(); callers must
 * await loadOpenCV() once at startup (worker bootstrap, test setup, tool entry).
 *
 * Gotcha of this build (5.0.0-release.1): `.data` and `.clone()` are broken
 * on ROI views — `view.copyTo(freshMat)` before pixel access. Views are fine
 * as inputs to cv calls.
 */
import cvModule from "@techstark/opencv-js";

export type CV = typeof cvModule;
export type Mat = InstanceType<CV["Mat"]>;

let cvInstance: CV | null = null;
let loading: Promise<CV> | null = null;

export function loadOpenCV(): Promise<CV> {
	if (cvInstance) return Promise.resolve(cvInstance);
	if (loading) return loading;
	const attempt = (async () => {
		// The package is patched (patches/@techstark__opencv-js…) to export
		// { cvReadyPromise } instead of the bare ready-promise: a thenable (or
		// default-wrapped thenable) module.exports leaks `then` through
		// vite-node's CJS namespace proxy and crashes every Node-side import.
		// Depending on bundler interop we see the wrapper (possibly nested
		// under `default`) or, in bundles that took the UMD's non-CJS branch,
		// the promise itself.
		const raw = cvModule as {
			cvReadyPromise?: unknown;
			default?: { cvReadyPromise?: unknown };
		} | null;
		const mod: unknown =
			raw?.cvReadyPromise ??
			raw?.default?.cvReadyPromise ??
			raw?.default ??
			raw;
		let cv: CV;
		if (mod instanceof Promise) {
			cv = await mod;
		} else if ((mod as CV).Mat) {
			cv = mod as CV;
		} else {
			await new Promise<void>((resolve) => {
				(mod as { onRuntimeInitialized?: () => void }).onRuntimeInitialized =
					resolve;
			});
			cv = mod as CV;
		}
		cvInstance = cv;
		return cv;
	})();
	// a failed load must not poison the singleton — clear it so callers can retry
	loading = attempt.catch((error) => {
		loading = null;
		throw error;
	});
	return loading;
}

export function getCV(): CV {
	if (!cvInstance) {
		throw new Error(
			"OpenCV not loaded — await loadOpenCV() before using core/",
		);
	}
	return cvInstance;
}

// The bundled type definitions mark the optional mask argument of these as
// required; thin wrappers restore the real (mask-less) signatures.

export interface MinMaxResult {
	minVal: number;
	maxVal: number;
	minLoc: { x: number; y: number };
	maxLoc: { x: number; y: number };
}

export function minMaxLoc(mat: Mat): MinMaxResult {
	return (getCV() as unknown as { minMaxLoc(m: Mat): MinMaxResult }).minMaxLoc(
		mat,
	);
}

export function meanOf(mat: Mat): number[] {
	return (getCV() as unknown as { mean(m: Mat): number[] }).mean(mat);
}
