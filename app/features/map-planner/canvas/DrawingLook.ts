// How a drawing looks: the Konva node of each kind, its stroke widths and
// font sizes in map coordinates. Texts are bold with an outline in the
// contrasting colour so they read on any part of the map. Shared by the
// drawing layer and the text editor. Plain Konva, no React.

import Konva from "konva";
import type {
	DrawingSize,
	PlanDrawing,
	TextDrawing,
} from "../core/PlanDocument";
import * as PlanGeometry from "../core/PlanGeometry";

const STROKE_WIDTHS: Record<DrawingSize, number> = { S: 4, M: 8, L: 14 };
const FONT_SIZES: Record<DrawingSize, number> = { S: 28, M: 40, L: 64 };
/** Of a text's font size. */
const TEXT_OUTLINE_RATIO = 0.14;
const TEXT_LINE_HEIGHT = 1.1;
export const TEXT_FONT_FAMILY = "Lexend, sans-serif";
export const TEXT_FONT_WEIGHT = "bold";

/** A Konva node drawing `drawing`, see {@link update}. */
export function createNode(drawing: PlanDrawing): Konva.Shape {
	const common = { lineCap: "round", lineJoin: "round" } as const;

	switch (drawing.type) {
		case "stroke":
		case "line":
			return new Konva.Line({ ...common, points: [] });
		case "arrow":
			return new Konva.Arrow({ ...common, points: [] });
		case "rectangle":
			return new Konva.Rect({ lineJoin: "round" });
		case "ellipse":
			return new Konva.Ellipse({ radiusX: 0, radiusY: 0 });
		case "text":
			return new Konva.Text({
				fontFamily: TEXT_FONT_FAMILY,
				fontStyle: TEXT_FONT_WEIGHT,
				lineHeight: TEXT_LINE_HEIGHT,
				fillAfterStrokeEnabled: true,
				lineJoin: "round",
			});
	}
}

/** Gives a node made by {@link createNode} for the same kind of drawing the drawing's shape and style. */
export function update(node: Konva.Shape, drawing: PlanDrawing) {
	const strokeWidth = STROKE_WIDTHS[drawing.size];

	switch (drawing.type) {
		case "stroke": {
			// a tap is a stroke of one point, drawn as a dot
			const points =
				drawing.points.length === 1
					? [drawing.points[0], drawing.points[0]]
					: drawing.points;
			node.setAttrs({
				points: points.flat(),
				stroke: drawing.color,
				strokeWidth,
			});
			return;
		}
		case "line":
			node.setAttrs({
				points: [...drawing.from, ...drawing.to],
				stroke: drawing.color,
				strokeWidth,
			});
			return;
		case "arrow":
			node.setAttrs({
				points: [...drawing.from, ...drawing.to],
				stroke: drawing.color,
				fill: drawing.color,
				strokeWidth,
				pointerLength: strokeWidth * 2 + 12,
				pointerWidth: strokeWidth * 2 + 12,
			});
			return;
		case "rectangle": {
			const { x, y, width, height } = PlanGeometry.boxFromCorners(
				drawing.from,
				drawing.to,
			);
			node.setAttrs({
				x,
				y,
				width,
				height,
				scaleX: 1,
				scaleY: 1,
				stroke: drawing.color,
				strokeWidth,
			});
			return;
		}
		case "ellipse": {
			const { x, y, width, height } = PlanGeometry.boxFromCorners(
				drawing.from,
				drawing.to,
			);
			node.setAttrs({
				x: x + width / 2,
				y: y + height / 2,
				radiusX: width / 2,
				radiusY: height / 2,
				scaleX: 1,
				scaleY: 1,
				stroke: drawing.color,
				strokeWidth,
			});
			return;
		}
		case "text":
			node.setAttrs({
				...textStyle(drawing),
				x: drawing.position[0],
				y: drawing.position[1],
				text: drawing.text,
				scaleX: drawing.scale ?? 1,
				scaleY: drawing.scale ?? 1,
			});
			return;
	}
}

/** Font size before the text's scale, fill and outline of a text. */
export function textStyle(drawing: Pick<TextDrawing, "size" | "color">) {
	const fontSize = FONT_SIZES[drawing.size];

	return {
		fontSize,
		fill: drawing.color,
		stroke: contrastingColor(drawing.color),
		strokeWidth: fontSize * TEXT_OUTLINE_RATIO,
		lineHeight: TEXT_LINE_HEIGHT,
	};
}

/** Width of the line drawn for a drawing of `size`, in map coordinates. */
export function strokeWidthOf(size: DrawingSize) {
	return STROKE_WIDTHS[size];
}

/** Black for light colours, white for dark ones. */
function contrastingColor(hexColor: string) {
	const value = Number.parseInt(hexColor.slice(1), 16);
	const luminance =
		0.299 * ((value >> 16) & 255) +
		0.587 * ((value >> 8) & 255) +
		0.114 * (value & 255);

	return luminance > 140 ? "rgba(0, 0, 0, 0.85)" : "rgba(255, 255, 255, 0.9)";
}
