// The plan's drawings as `DrawingLook` draws them, in the plan's order, plus
// what the drawing tools show while they work: the drawing being drawn, the
// selection box, outlines of the selected drawings and handles resizing a
// single selected rectangle, ellipse or text. Answers what is under a point
// or inside a box for the tools. Plain Konva, no React.

import Konva from "konva";
import * as PlanCommands from "../core/PlanCommands";
import type { PlanDrawing, Point } from "../core/PlanDocument";
import type { PlanEditor } from "../core/PlanEditor";
import * as PlanGeometry from "../core/PlanGeometry";
import * as PlanSelection from "../core/PlanSelection";
import * as DrawingLook from "./DrawingLook";

/** How far from a drawing's line a pointer still hits it, in screen pixels. */
const HIT_SLOP = 6;
const SELECTION_COLOR = "#38bdf8";
/** Outline of a selected drawing: gap to the drawing and line width, in screen pixels. */
const SELECTION_OUTLINE = { padding: 6, width: 1.5 };
const HANDLE_SIZE = 10;
/** Smallest a rectangle, ellipse or text can be resized to, in screen pixels. */
const MIN_RESIZE = 8;
const SELECTION_BOX_FILL = "rgba(56, 189, 248, 0.12)";
/** Texts only grow and shrink as a whole, so only from their corners. */
const CORNER_ANCHORS = ["top-left", "top-right", "bottom-left", "bottom-right"];
const ALL_ANCHORS = [
	...CORNER_ANCHORS,
	"top-center",
	"middle-right",
	"middle-left",
	"bottom-center",
];

/** See {@link create}. */
export interface DrawingLayer {
	/** The id of the topmost drawing under a point of the stage's container, `null` for none. */
	drawingAt: (containerPoint: Point) => string | null;
	/** Ids of the drawings whose line (or, for a text, its box) touches the box, in map coordinates. */
	drawingsInBox: (box: PlanGeometry.Box) => string[];
	/** The box a drawing covers as drawn, its line width included, in map coordinates. */
	boundsOf: (id: string) => PlanGeometry.Box | null;
	/** Whether a point of the stage's container is on a resize handle. */
	isOnHandle: (containerPoint: Point) => boolean;
	/** Draws a drawing that isn't part of the plan yet on top of the others, `null` to stop. */
	showPreview: (drawing: PlanDrawing | null) => void;
	/** Draws the selection box being dragged, in map coordinates, `null` to stop. */
	showSelectionBox: (box: PlanGeometry.Box | null) => void;
	/** Leaves a drawing out while it is edited elsewhere, e.g. a text in its text field. */
	setHidden: (id: string | null) => void;
	/** Keeps what is sized in screen pixels the same size after a zoom. */
	onZoom: () => void;
	destroy: () => void;
}

/**
 * Adds the drawings to `parent` and what shows and edits the selection to `overlay`, a layer
 * above every other so its handles can always be grabbed.
 */
export function create({
	parent,
	overlay,
	editor,
	selection,
}: {
	parent: Konva.Layer;
	overlay: Konva.Layer;
	editor: PlanEditor;
	selection: PlanSelection.PlanSelection;
}): DrawingLayer {
	const root = new Konva.Group();
	const nodes = new Map<string, Konva.Shape>();
	/** The drawing each node was last updated to, unchanged drawings keeping their object in the plan. */
	const drawnAs = new Map<Konva.Shape, PlanDrawing>();
	const idsOfNodes = new Map<Konva.Shape, string>();
	let preview: { node: Konva.Shape; type: PlanDrawing["type"] } | null = null;
	let hiddenId: string | null = null;
	parent.add(root);

	const outlines = new Konva.Group({ listening: false });
	const selectionBox = new Konva.Rect({
		visible: false,
		listening: false,
		fill: SELECTION_BOX_FILL,
		stroke: SELECTION_COLOR,
		strokeScaleEnabled: false,
		strokeWidth: 1,
	});
	const transformer = new Konva.Transformer({
		rotateEnabled: false,
		flipEnabled: false,
		ignoreStroke: true,
		anchorSize: HANDLE_SIZE,
		anchorStroke: SELECTION_COLOR,
		anchorFill: "#ffffff",
		anchorCornerRadius: 2,
		borderStroke: SELECTION_COLOR,
		borderStrokeWidth: SELECTION_OUTLINE.width,
		padding: SELECTION_OUTLINE.padding,
		boundBoxFunc: (oldBox, newBox) =>
			Math.abs(newBox.width) < MIN_RESIZE ||
			Math.abs(newBox.height) < MIN_RESIZE
				? oldBox
				: newBox,
	});
	overlay.add(outlines, selectionBox, transformer);

	const zoom = () => parent.getStage()?.scaleX() ?? 1;

	const hitStrokeWidthOf = (drawing: PlanDrawing) =>
		DrawingLook.strokeWidthOf(drawing.size) + (HIT_SLOP * 2) / zoom();

	const drawingById = (id: string) =>
		editor.getDocument().drawings.find((drawing) => drawing.id === id);

	transformer.on("transformstart", editor.beginGroup);
	transformer.on("transformend", editor.endGroup);
	transformer.on("transform", () => {
		const node = transformer.nodes()[0] as Konva.Shape | undefined;
		const id = node ? idsOfNodes.get(node) : undefined;
		const drawing = id ? drawingById(id) : undefined;
		if (!node || !id || !drawing) return;

		if (drawing.type === "text") {
			editor.apply(
				PlanCommands.scaleText(editor.getDocument(), id, {
					position: [node.x(), node.y()],
					scale: node.scaleX(),
				}),
			);
		} else if (drawing.type === "rectangle") {
			editor.apply(
				PlanCommands.resizeShape(editor.getDocument(), id, {
					x: node.x(),
					y: node.y(),
					width: node.width() * node.scaleX(),
					height: node.height() * node.scaleY(),
				}),
			);
		} else if (node instanceof Konva.Ellipse) {
			const radiusX = node.radiusX() * node.scaleX();
			const radiusY = node.radiusY() * node.scaleY();
			editor.apply(
				PlanCommands.resizeShape(editor.getDocument(), id, {
					x: node.x() - radiusX,
					y: node.y() - radiusY,
					width: radiusX * 2,
					height: radiusY * 2,
				}),
			);
		}
	});

	const boundsOfNode = (node: Konva.Shape): PlanGeometry.Box =>
		node.getClientRect({ relativeTo: parent });

	const renderSelection = () => {
		const ids = PlanSelection.selectedDrawingIds(selection.get()).filter(
			(id) => id !== hiddenId,
		);
		const selectedNodes = ids.flatMap((id) => nodes.get(id) ?? []);
		const resizable =
			selectedNodes.length === 1 &&
			["rectangle", "ellipse", "text"].includes(drawingById(ids[0])?.type ?? "")
				? selectedNodes[0]
				: null;

		if (resizable) {
			const isText = drawingById(ids[0])?.type === "text";
			transformer.keepRatio(isText);
			transformer.enabledAnchors(isText ? CORNER_ANCHORS : ALL_ANCHORS);
			if (transformer.nodes()[0] !== resizable) transformer.nodes([resizable]);
		} else if (transformer.nodes().length > 0) {
			transformer.nodes([]);
		}

		outlines.destroyChildren();
		if (resizable) return;

		const padding = SELECTION_OUTLINE.padding / zoom();
		for (const node of selectedNodes) {
			const box = boundsOfNode(node);
			outlines.add(
				new Konva.Rect({
					x: box.x - padding,
					y: box.y - padding,
					width: box.width + padding * 2,
					height: box.height + padding * 2,
					stroke: SELECTION_COLOR,
					strokeWidth: SELECTION_OUTLINE.width,
					strokeScaleEnabled: false,
				}),
			);
		}
	};

	const render = () => {
		const document = editor.getDocument();
		const existingIds = new Set(document.drawings.map((drawing) => drawing.id));

		for (const [id, node] of nodes) {
			if (existingIds.has(id)) continue;
			node.destroy();
			nodes.delete(id);
			idsOfNodes.delete(node);
			drawnAs.delete(node);
		}

		for (const [index, drawing] of document.drawings.entries()) {
			let node = nodes.get(drawing.id);
			if (!node) {
				node = DrawingLook.createNode(drawing);
				nodes.set(drawing.id, node);
				idsOfNodes.set(node, drawing.id);
				root.add(node);
			}
			if (drawnAs.get(node) !== drawing) {
				DrawingLook.update(node, drawing);
				node.hitStrokeWidth(hitStrokeWidthOf(drawing));
				drawnAs.set(node, drawing);
			}
			node.visible(drawing.id !== hiddenId);
			if (node.zIndex() !== index) node.zIndex(index);
		}

		const selectedIds = PlanSelection.selectedDrawingIds(selection.get());
		const remainingIds = selectedIds.filter((id) => existingIds.has(id));
		if (remainingIds.length !== selectedIds.length) {
			// renders the selection through the selection's listener
			selection.set({ type: "drawings", ids: remainingIds });
			return;
		}
		renderSelection();
	};

	const unsubscribeEditor = editor.subscribe(render);
	const unsubscribeSelection = selection.subscribe(renderSelection);
	render();

	return {
		drawingAt: ([x, y]) => {
			const shape = parent.getIntersection({ x, y });
			return shape ? (idsOfNodes.get(shape) ?? null) : null;
		},
		drawingsInBox: (box) =>
			editor
				.getDocument()
				.drawings.filter((drawing) => {
					const outline =
						PlanGeometry.outlineOf(drawing) ??
						PlanGeometry.boxOutline(boundsOfNode(nodes.get(drawing.id)!));
					return PlanGeometry.polylineTouchesBox(outline, box);
				})
				.map((drawing) => drawing.id),
		boundsOf: (id) => {
			const node = nodes.get(id);
			return node ? boundsOfNode(node) : null;
		},
		isOnHandle: ([x, y]) => {
			const shape = overlay.getIntersection({ x, y });
			return Boolean(shape && shape.getParent() === transformer);
		},
		showPreview: (drawing) => {
			if (!drawing) {
				preview?.node.destroy();
				preview = null;
				return;
			}

			if (preview?.type !== drawing.type) {
				preview?.node.destroy();
				preview = {
					node: DrawingLook.createNode(drawing),
					type: drawing.type,
				};
				preview.node.listening(false);
				parent.add(preview.node);
			}
			DrawingLook.update(preview.node, drawing);
		},
		showSelectionBox: (box) => {
			selectionBox.visible(Boolean(box));
			if (box) selectionBox.setAttrs(box);
		},
		setHidden: (id) => {
			hiddenId = id;
			render();
		},
		onZoom: () => {
			for (const drawing of editor.getDocument().drawings) {
				nodes.get(drawing.id)?.hitStrokeWidth(hitStrokeWidthOf(drawing));
			}
			renderSelection();
		},
		destroy: () => {
			unsubscribeEditor();
			unsubscribeSelection();
			root.destroy();
			preview?.node.destroy();
			outlines.destroy();
			selectionBox.destroy();
			transformer.destroy();
		},
	};
}
