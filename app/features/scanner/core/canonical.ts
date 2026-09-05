/** Pure constants/types shared by UI and pipeline; no OpenCV dependency, so the main bundle never pulls in the WASM. */
export const CANONICAL_WIDTH = 1920;
export const CANONICAL_HEIGHT = 1080;

export interface Roi {
	x: number;
	y: number;
	w: number;
	h: number;
}
