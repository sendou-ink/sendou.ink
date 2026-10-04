import * as R from "remeda";

export const MAX_ZOOM = 4;

export type Rotation = 0 | 90 | 180 | 270;

export interface Size {
	width: number;
	height: number;
}

/** Which point of the (rotated) image sits at the frame center, as fractions of its width and height. */
export interface Crop {
	zoom: number;
	center: { x: number; y: number };
	rotation: Rotation;
}

/** The fixed facts a crop is applied to: the picked image and the shape of the frame. */
export interface CropBounds {
	imageSize: Size;
	aspectRatio: number;
}

/** Whole image centered in the frame, not zoomed or rotated. */
export function initial(): Crop {
	return { zoom: 1, center: { x: 0.5, y: 0.5 }, rotation: 0 };
}

/** Size of the image once `rotation` is applied. */
export function orientedSize(imageSize: Size, rotation: Rotation): Size {
	return rotation % 180 === 0
		? imageSize
		: { width: imageSize.height, height: imageSize.width };
}

/** The part of the rotated image inside the frame, in rotated image pixels. */
export function sourceRect(crop: Crop, bounds: CropBounds) {
	const image = orientedSize(bounds.imageSize, crop.rotation);
	const { width, height } = visibleSize(crop, bounds);

	return {
		x: crop.center.x * image.width - width / 2,
		y: crop.center.y * image.height - height / 2,
		width,
		height,
	};
}

/** Limits zoom to `1..MAX_ZOOM` and moves the center so the frame never shows anything outside the image. */
export function clamp(crop: Crop, bounds: CropBounds): Crop {
	const zoom = R.clamp(crop.zoom, { min: 1, max: MAX_ZOOM });
	const image = orientedSize(bounds.imageSize, crop.rotation);
	const visible = visibleSize({ ...crop, zoom }, bounds);

	const halfVisibleX = visible.width / image.width / 2;
	const halfVisibleY = visible.height / image.height / 2;

	return {
		zoom,
		center: {
			x: R.clamp(crop.center.x, { min: halfVisibleX, max: 1 - halfVisibleX }),
			y: R.clamp(crop.center.y, { min: halfVisibleY, max: 1 - halfVisibleY }),
		},
		rotation: crop.rotation,
	};
}

/** Moves the image by a drag of `delta` screen pixels over a frame `frameWidth` pixels wide. */
export function pan(
	crop: Crop,
	delta: { x: number; y: number },
	frameWidth: number,
	bounds: CropBounds,
): Crop {
	const image = orientedSize(bounds.imageSize, crop.rotation);
	const imagePixelsPerScreenPixel =
		visibleSize(crop, bounds).width / frameWidth;

	return clamp(
		{
			...crop,
			center: {
				x: crop.center.x - (delta.x * imagePixelsPerScreenPixel) / image.width,
				y: crop.center.y - (delta.y * imagePixelsPerScreenPixel) / image.height,
			},
		},
		bounds,
	);
}

/**
 * Sets the zoom while keeping the image point under `anchor` in place. `anchor` is in screen pixels
 * relative to the frame center, so `{ x: 0, y: 0 }` zooms into the middle of the frame.
 */
export function zoomAround(
	crop: Crop,
	zoom: number,
	anchor: { x: number; y: number },
	frameWidth: number,
	bounds: CropBounds,
): Crop {
	const nextZoom = R.clamp(zoom, { min: 1, max: MAX_ZOOM });
	const image = orientedSize(bounds.imageSize, crop.rotation);

	const imagePixelsPerScreenPixel = (c: Crop) =>
		visibleSize(c, bounds).width / frameWidth;
	const shift =
		imagePixelsPerScreenPixel(crop) -
		imagePixelsPerScreenPixel({ ...crop, zoom: nextZoom });

	return clamp(
		{
			...crop,
			zoom: nextZoom,
			center: {
				x: crop.center.x + (anchor.x * shift) / image.width,
				y: crop.center.y + (anchor.y * shift) / image.height,
			},
		},
		bounds,
	);
}

/** Turns the image 90° clockwise, keeping the same point at the frame center. */
export function rotate(crop: Crop, bounds: CropBounds): Crop {
	return clamp(
		{
			zoom: crop.zoom,
			center: { x: 1 - crop.center.y, y: crop.center.x },
			rotation: ((crop.rotation + 90) % 360) as Rotation,
		},
		bounds,
	);
}

function visibleSize(crop: Crop, bounds: CropBounds): Size {
	const image = orientedSize(bounds.imageSize, crop.rotation);
	const widthAtZoomOne = Math.min(
		image.width,
		image.height * bounds.aspectRatio,
	);
	const width = widthAtZoomOne / crop.zoom;

	return { width, height: width / bounds.aspectRatio };
}
