// Geometry of drawings in map coordinates: moving them, keeping them on the
// map and telling whether a selection box touches them. Framework-free, the
// sizes the renderer decides (stroke widths, text extents) are left to it.

import { MAP_SIZE, type PlanDrawing, type Point } from "./PlanDocument";

/** Corners of the polygon standing in for an ellipse's outline. */
const ELLIPSE_OUTLINE_POINTS = 32;

/** An axis aligned box in map coordinates. */
export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** The box spanned by two corners given in any order. */
export function boxFromCorners([ax, ay]: Point, [bx, by]: Point): Box {
	return {
		x: Math.min(ax, bx),
		y: Math.min(ay, by),
		width: Math.abs(ax - bx),
		height: Math.abs(ay - by),
	};
}

/** The drawing moved by `delta`. */
export function translated(drawing: PlanDrawing, [dx, dy]: Point): PlanDrawing {
	const move = ([x, y]: Point): Point => [x + dx, y + dy];

	switch (drawing.type) {
		case "stroke":
			return { ...drawing, points: drawing.points.map(move) };
		case "text":
			return { ...drawing, position: move(drawing.position) };
		default:
			return { ...drawing, from: move(drawing.from), to: move(drawing.to) };
	}
}

/** The points a drawing is placed by: a stroke's points, both corners of the others, a text's top left corner. */
export function anchorsOf(drawing: PlanDrawing): Point[] {
	switch (drawing.type) {
		case "stroke":
			return drawing.points;
		case "text":
			return [drawing.position];
		default:
			return [drawing.from, drawing.to];
	}
}

/**
 * The line a drawing is drawn along, closed shapes ending where they start. `null` for a text,
 * whose extent only the renderer knows.
 */
export function outlineOf(drawing: PlanDrawing): Point[] | null {
	switch (drawing.type) {
		case "text":
			return null;
		case "stroke":
			return drawing.points;
		case "arrow":
		case "line":
			return [drawing.from, drawing.to];
		case "rectangle":
			return boxOutline(boxFromCorners(drawing.from, drawing.to));
		case "ellipse": {
			const box = boxFromCorners(drawing.from, drawing.to);
			const center: Point = [box.x + box.width / 2, box.y + box.height / 2];

			return Array.from({ length: ELLIPSE_OUTLINE_POINTS + 1 }, (_, index) => {
				const angle = (index / ELLIPSE_OUTLINE_POINTS) * Math.PI * 2;
				return [
					center[0] + (Math.cos(angle) * box.width) / 2,
					center[1] + (Math.sin(angle) * box.height) / 2,
				];
			});
		}
	}
}

/** The four sides of a box as a closed outline. */
export function boxOutline(box: Box): Point[] {
	const right = box.x + box.width;
	const bottom = box.y + box.height;

	return [
		[box.x, box.y],
		[right, box.y],
		[right, bottom],
		[box.x, bottom],
		[box.x, box.y],
	];
}

/** Whether a line through `points` touches the box: a point inside it or a segment crossing it. */
export function polylineTouchesBox(points: Point[], box: Box) {
	if (points.some((point) => isInBox(point, box))) return true;

	for (let index = 1; index < points.length; index++) {
		if (segmentCrossesBox(points[index - 1], points[index], box)) return true;
	}
	return false;
}

/** `delta` shortened on each axis so that moving every point by it keeps them all on the map. */
export function deltaKeepingOnMap(points: Point[], [dx, dy]: Point): Point {
	if (points.length === 0) return [dx, dy];

	const xs = points.map(([x]) => x);
	const ys = points.map(([, y]) => y);

	return [
		clamp(dx, -Math.min(...xs), MAP_SIZE.width - Math.max(...xs)),
		clamp(dy, -Math.min(...ys), MAP_SIZE.height - Math.max(...ys)),
	];
}

function clamp(value: number, min: number, max: number) {
	// a point already off the map may stay there, but not get further away
	return Math.min(Math.max(value, Math.min(min, 0)), Math.max(max, 0));
}

/** Whether the point is inside the box or on its edge. */
export function isInBox([x, y]: Point, box: Box) {
	return (
		x >= box.x &&
		x <= box.x + box.width &&
		y >= box.y &&
		y <= box.y + box.height
	);
}

/** Liang–Barsky: clips the segment to the box, crossing it if anything is left. */
function segmentCrossesBox([ax, ay]: Point, [bx, by]: Point, box: Box) {
	const dx = bx - ax;
	const dy = by - ay;
	let start = 0;
	let end = 1;

	const edges: Array<[p: number, q: number]> = [
		[-dx, ax - box.x],
		[dx, box.x + box.width - ax],
		[-dy, ay - box.y],
		[dy, box.y + box.height - ay],
	];
	for (const [p, q] of edges) {
		if (p === 0) {
			if (q < 0) return false;
			continue;
		}

		const t = q / p;
		if (p < 0) start = Math.max(start, t);
		else end = Math.min(end, t);
		if (start > end) return false;
	}

	return true;
}
