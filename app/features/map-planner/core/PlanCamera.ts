// What part of the map the viewport shows. Never past the map's edges: at the
// smallest zoom the whole map fits, an axis shorter than the viewport is
// centered and a longer one can't scroll past the map. Framework-free.

import { MAP_SIZE, type Point } from "./PlanDocument";

/**
 * How far in the camera zooms, relative to fitting the whole map.
 * @internal
 */
export const MAX_ZOOM = 8;

/** Screen point = map point × `scale` + (`x`, `y`). */
export interface Camera {
	scale: number;
	x: number;
	y: number;
}

/** Size of the area the map is drawn in, in screen pixels. */
export interface Viewport {
	width: number;
	height: number;
}

/** The whole map centered in the viewport, the smallest zoom there is. */
export function fit(viewport: Viewport): Camera {
	return clamp({ scale: fitScale(viewport), x: 0, y: 0 }, viewport);
}

/** The camera moved and zoomed back inside the map's edges and the zoom limits. */
export function clamp(camera: Camera, viewport: Viewport): Camera {
	const minScale = fitScale(viewport);
	const scale = Math.min(Math.max(camera.scale, minScale), minScale * MAX_ZOOM);

	return {
		scale,
		x: clampAxis(camera.x, MAP_SIZE.width * scale, viewport.width),
		y: clampAxis(camera.y, MAP_SIZE.height * scale, viewport.height),
	};
}

/** Zooms by `factor` keeping the map point under the screen point `anchor` in place. */
export function zoomAt(
	camera: Camera,
	viewport: Viewport,
	anchor: Point,
	factor: number,
): Camera {
	const [anchorX, anchorY] = anchor;
	const [mapX, mapY] = toMap(camera, anchor);
	const scale = camera.scale * factor;

	return clamp(
		{ scale, x: anchorX - mapX * scale, y: anchorY - mapY * scale },
		viewport,
	);
}

/** Moves the view by screen pixels, the map following the pointer. */
export function panBy(
	camera: Camera,
	viewport: Viewport,
	[deltaX, deltaY]: Point,
): Camera {
	return clamp(
		{ ...camera, x: camera.x + deltaX, y: camera.y + deltaY },
		viewport,
	);
}

/** Whether the camera shows the whole map, i.e. is at the smallest zoom. */
export function isFitted(camera: Camera, viewport: Viewport) {
	return camera.scale <= fitScale(viewport) + Number.EPSILON;
}

/**
 * The map point under a screen point.
 * @internal
 */
export function toMap(camera: Camera, [screenX, screenY]: Point): Point {
	return [
		(screenX - camera.x) / camera.scale,
		(screenY - camera.y) / camera.scale,
	];
}

function fitScale(viewport: Viewport) {
	return Math.min(
		viewport.width / MAP_SIZE.width,
		viewport.height / MAP_SIZE.height,
	);
}

function clampAxis(offset: number, mapLength: number, viewportLength: number) {
	if (mapLength <= viewportLength) return (viewportLength - mapLength) / 2;

	return Math.min(0, Math.max(viewportLength - mapLength, offset));
}
