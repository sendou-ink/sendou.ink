/**
 * Pure constants/types shared by UI and pipeline. No OpenCV dependency —
 * the main-thread bundle must not pull in the WASM module (that lives in
 * the worker).
 */
export const CANONICAL_WIDTH = 1920;
export const CANONICAL_HEIGHT = 1080;

export interface Roi {
	x: number;
	y: number;
	w: number;
	h: number;
}
