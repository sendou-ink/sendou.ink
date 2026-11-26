// What a press on the map does with the tool in hand, from pointer down to
// up: select (click, Shift+click, box) and move drawings, draw with the pen,
// erase whole drawings, span arrows, lines and shapes, place a text. New
// drawings are only previewed until the pointer goes up, then added as one
// operation. Plain Konva and DOM, no React.

import * as PlanCommands from "../core/PlanCommands";
import {
	MAP_SIZE,
	newId,
	type Point,
	type SpanDrawing,
	type StrokeDrawing,
} from "../core/PlanDocument";
import type { PlanEditor } from "../core/PlanEditor";
import * as PlanGeometry from "../core/PlanGeometry";
import * as PlanSelection from "../core/PlanSelection";
import type { PlanTools } from "../core/PlanTools";
import type { DrawingLayer } from "./DrawingLayer";
import type { TextEditor } from "./TextEditor";

/** How far a pointer moves, in screen pixels, before a press becomes a drag. */
const DRAG_THRESHOLD = 4;
/** Pen points closer than this to the last one are skipped, in screen pixels. */
const PEN_POINT_SPACING = 2;
/** Spacing of the points the eraser checks between two pointer positions, in screen pixels. */
const ERASER_STEP = 4;

/** A press being followed, fed the pointer's positions in the stage's container. */
export interface Gesture {
	move: (containerPoint: Point) => void;
	end: (containerPoint: Point) => void;
	/** Stops without finishing, e.g. when a second finger turns it into a pinch. */
	cancel: () => void;
}

/** What the tools need of the canvas. */
export interface ToolContext {
	editor: PlanEditor;
	selection: PlanSelection.PlanSelection;
	tools: PlanTools;
	drawings: DrawingLayer;
	textEditor: TextEditor;
	toMap: (containerPoint: Point) => Point;
	/** Screen pixels per map pixel. */
	zoom: () => number;
}

/** Follows a press of the tool in hand at a point of the stage's container. */
export function startGesture(
	context: ToolContext,
	containerPoint: Point,
	{ shiftKey }: { shiftKey: boolean },
): Gesture {
	switch (context.tools.get().tool) {
		case "select":
			return selectGesture(context, containerPoint, shiftKey);
		case "pen":
			return penGesture(context, containerPoint);
		case "eraser":
			return eraserGesture(context, containerPoint);
		case "text":
			return textGesture(context, containerPoint);
		case "arrow":
		case "line":
		case "rectangle":
		case "ellipse":
			return spanGesture(context, containerPoint);
	}
}

/**
 * On a drawing (or inside the outline of a selected one) selects it and drags the selection,
 * Shift adding it to or taking it out of the selection. Anywhere else drags a selection box,
 * Shift adding what it touches to the selection; a click there selects nothing.
 */
function selectGesture(
	context: ToolContext,
	start: Point,
	shiftKey: boolean,
): Gesture {
	const { selection, drawings, editor } = context;
	const selectedIds = PlanSelection.selectedDrawingIds(selection.get());
	const id = drawings.drawingAt(start) ?? selectedDrawingAt(context, start);

	if (id && shiftKey) {
		selection.set({
			type: "drawings",
			ids: selectedIds.includes(id)
				? selectedIds.filter((selectedId) => selectedId !== id)
				: [...selectedIds, id],
		});
		return { move: () => {}, end: () => {}, cancel: () => {} };
	}

	if (id) {
		const wasSelected = selectedIds.includes(id);
		if (!wasSelected) selection.set({ type: "drawings", ids: [id] });

		const movedIds = PlanSelection.selectedDrawingIds(selection.get());
		const originals = editor
			.getDocument()
			.drawings.filter((drawing) => movedIds.includes(drawing.id));
		const startMap = context.toMap(start);
		const drag = dragTracker(start);

		return {
			move: (point) => {
				if (!drag.moved(point)) return;
				if (drag.justStarted()) editor.beginGroup();

				const [x, y] = context.toMap(point);
				editor.apply(
					PlanCommands.moveDrawings(originals, [
						x - startMap[0],
						y - startMap[1],
					]),
				);
			},
			end: () => {
				if (drag.started()) {
					editor.endGroup();
				} else if (wasSelected) {
					// a click on one of several selected drawings keeps only it
					selection.set({ type: "drawings", ids: [id] });
				}
			},
			cancel: () => {
				if (drag.started()) editor.endGroup();
			},
		};
	}

	const startMap = context.toMap(start);
	const keptIds = shiftKey ? selectedIds : [];
	const drag = dragTracker(start);

	return {
		move: (point) => {
			if (!drag.moved(point)) return;

			const box = PlanGeometry.boxFromCorners(startMap, context.toMap(point));
			drawings.showSelectionBox(box);
			const boxedIds = drawings.drawingsInBox(box);
			selection.set({
				type: "drawings",
				ids: [
					...keptIds,
					...boxedIds.filter((boxedId) => !keptIds.includes(boxedId)),
				],
			});
		},
		end: () => {
			drawings.showSelectionBox(null);
			if (!drag.started() && !shiftKey) selection.set(null);
		},
		cancel: () => drawings.showSelectionBox(null),
	};
}

function penGesture(context: ToolContext, start: Point): Gesture {
	const { color, size } = context.tools.get();
	const points: Point[] = [onMap(context.toMap(start))];
	const stroke = (): StrokeDrawing => ({
		id: "preview",
		type: "stroke",
		color,
		size,
		points,
	});
	context.drawings.showPreview(stroke());

	return {
		move: (point) => {
			const mapPoint = onMap(context.toMap(point));
			const last = points[points.length - 1];
			if (
				Math.hypot(mapPoint[0] - last[0], mapPoint[1] - last[1]) *
					context.zoom() <
				PEN_POINT_SPACING
			) {
				return;
			}

			points.push(mapPoint);
			context.drawings.showPreview(stroke());
		},
		end: () => {
			context.drawings.showPreview(null);
			context.editor.apply({
				type: "addDrawing",
				drawing: { ...stroke(), id: newId(), points: points.map(rounded) },
			});
		},
		cancel: () => context.drawings.showPreview(null),
	};
}

/** Removes every drawing the pointer passes over, the whole drag one undo step. */
function eraserGesture(context: ToolContext, start: Point): Gesture {
	const { editor, drawings } = context;
	let last = start;

	const eraseAt = (point: Point) => {
		const id = drawings.drawingAt(point);
		if (id)
			editor.apply(PlanCommands.removeDrawings(editor.getDocument(), [id]));
	};

	editor.beginGroup();
	eraseAt(start);

	return {
		move: (point) => {
			const steps = Math.max(
				1,
				Math.ceil(
					Math.hypot(point[0] - last[0], point[1] - last[1]) / ERASER_STEP,
				),
			);
			for (let step = 1; step <= steps; step++) {
				eraseAt([
					last[0] + ((point[0] - last[0]) * step) / steps,
					last[1] + ((point[1] - last[1]) * step) / steps,
				]);
			}
			last = point;
		},
		end: editor.endGroup,
		cancel: editor.endGroup,
	};
}

/** A label is placed where the press ends; on an existing one it is edited instead. A press while a label is being typed only saves it. */
function textGesture(context: ToolContext, start: Point): Gesture {
	const wasEditing = context.textEditor.isOpen();

	return {
		move: () => {},
		end: (point) => {
			if (wasEditing) return;

			const id = context.drawings.drawingAt(point);
			const existing = context.editor
				.getDocument()
				.drawings.find((drawing) => drawing.id === id);
			if (existing?.type === "text") {
				context.textEditor.openExisting(existing.id);
				return;
			}
			context.textEditor.openNew(rounded(onMap(context.toMap(start))));
		},
		cancel: () => {},
	};
}

/** Arrows, lines, rectangles and ellipses span from where the press starts to where it ends. */
function spanGesture(context: ToolContext, start: Point): Gesture {
	const { tool, color, size } = context.tools.get();
	const from = onMap(context.toMap(start));
	const drag = dragTracker(start);
	let to = from;
	const span = (): SpanDrawing => ({
		id: "preview",
		type: tool as SpanDrawing["type"],
		color,
		size,
		from,
		to,
	});

	return {
		move: (point) => {
			if (!drag.moved(point)) return;

			to = onMap(context.toMap(point));
			context.drawings.showPreview(span());
		},
		end: () => {
			context.drawings.showPreview(null);
			if (!drag.started()) return;

			context.editor.apply({
				type: "addDrawing",
				drawing: {
					...span(),
					id: newId(),
					from: rounded(from),
					to: rounded(to),
				},
			});
		},
		cancel: () => context.drawings.showPreview(null),
	};
}

/** The selected drawing whose outline (as drawn) the point is inside of, so a selection can be dragged by its inside. */
function selectedDrawingAt(context: ToolContext, containerPoint: Point) {
	const mapPoint = context.toMap(containerPoint);

	return (
		PlanSelection.selectedDrawingIds(context.selection.get()).findLast((id) => {
			const box = context.drawings.boundsOf(id);
			return box !== null && PlanGeometry.isInBox(mapPoint, box);
		}) ?? null
	);
}

/** Tells a click from a drag: a press becomes a drag once it moved {@link DRAG_THRESHOLD}. */
function dragTracker(start: Point) {
	let started = false;
	let isFirstMove = false;

	return {
		/** Whether the press is a drag by now, given its latest point. */
		moved: (point: Point) => {
			isFirstMove = false;
			if (started) return true;
			if (
				Math.hypot(point[0] - start[0], point[1] - start[1]) < DRAG_THRESHOLD
			) {
				return false;
			}

			started = true;
			isFirstMove = true;
			return true;
		},
		/** Whether the last {@link moved} turned the press into a drag. */
		justStarted: () => isFirstMove,
		started: () => started,
	};
}

function onMap([x, y]: Point): Point {
	return [
		Math.min(Math.max(x, 0), MAP_SIZE.width),
		Math.min(Math.max(y, 0), MAP_SIZE.height),
	];
}

function rounded([x, y]: Point): Point {
	return [Math.round(x), Math.round(y)];
}
