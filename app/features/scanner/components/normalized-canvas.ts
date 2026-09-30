import {
	CANONICAL_HEIGHT,
	CANONICAL_WIDTH,
	detectContentBox,
} from "../core/canonical";

/**
 * Draws a frame at canonical size the way the worker normalizes it — black
 * bars around the picture cropped away, then scaled — so ROI crops shown in
 * the UI line up with what the detectors read.
 */
export function drawNormalizedCanvas(
	source: CanvasImageSource,
	width: number,
	height: number,
): HTMLCanvasElement {
	const native = document.createElement("canvas");
	native.width = width;
	native.height = height;
	const nativeCtx = native.getContext("2d", { willReadFrequently: true })!;
	nativeCtx.drawImage(source, 0, 0);
	const { data } = nativeCtx.getImageData(0, 0, width, height);
	const box = detectContentBox(width, height, data) ?? {
		x: 0,
		y: 0,
		w: width,
		h: height,
	};

	const canvas = document.createElement("canvas");
	canvas.width = CANONICAL_WIDTH;
	canvas.height = CANONICAL_HEIGHT;
	canvas
		.getContext("2d")!
		.drawImage(
			native,
			box.x,
			box.y,
			box.w,
			box.h,
			0,
			0,
			CANONICAL_WIDTH,
			CANONICAL_HEIGHT,
		);
	return canvas;
}
