// Draws a plan on a Konva stage inside a container element and redraws it
// on every change of the editor's document. Plain Konva and DOM, no React,
// so any UI framework can host it. Owns the camera (wheel and pinch zoom,
// pans with Space, the middle button or two fingers, never past the map's
// edges) and hands every other press to the drawing tool in hand.

import Konva from "konva";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { stageMinimapImageUrlWithEnding } from "~/utils/urls";
import * as PlanCamera from "../core/PlanCamera";
import * as PlanCommands from "../core/PlanCommands";
import {
	MAP_SIZE,
	type PlanDocument,
	type Point,
	type SlotIndex,
	teamOfSlot,
} from "../core/PlanDocument";
import type { PlanEditor } from "../core/PlanEditor";
import * as PlanSelection from "../core/PlanSelection";
import type { PlanTools, Tool } from "../core/PlanTools";
import * as DrawingLayer from "./DrawingLayer";
import * as DrawingTools from "./DrawingTools";
import * as MarkerLayer from "./MarkerLayer";
import * as RadiusLayer from "./RadiusLayer";
import * as TextEditor from "./TextEditor";
import * as TokenGhost from "./TokenGhost";
import * as TokenLayer from "./TokenLayer";

const WHEEL_ZOOM_SPEED = 0.002;
/** Trackpad pinches arrive as wheel events with small deltas and `ctrlKey` set. */
const PINCH_WHEEL_ZOOM_SPEED = 0.01;
const WHEEL_LINE_HEIGHT_PX = 16;
const MIDDLE_MOUSE_BUTTON = 1;
const RIGHT_MOUSE_BUTTON = 2;
const TOOL_CURSORS: Record<Tool, string> = {
	select: "",
	pen: "crosshair",
	eraser: "crosshair",
	arrow: "crosshair",
	line: "crosshair",
	text: "text",
	rectangle: "crosshair",
	ellipse: "crosshair",
};

/** What a context menu opened on the map is about. */
export type ContextMenuTarget =
	| { type: "player"; slot: SlotIndex }
	| { type: "marker"; id: string }
	| { type: "drawings"; ids: string[] };

/** See {@link create}. */
export interface PlanCanvas {
	/** Shows the whole map. */
	fitView: () => void;
	/** Moves the view to show the map point in the middle, if zoomed in. */
	centerOn: (point: Point) => void;
	/**
	 * Gives the slot a player with the weapon and lets the pointer carry its token onto the map,
	 * from a drag that started outside the canvas (e.g. in the weapon picker). Released over the
	 * map it is placed there, anywhere else on its team's side. One undo step.
	 */
	dragNewPlayer: (args: {
		slot: SlotIndex;
		weaponId: MainWeaponId;
		clientPoint: Point;
	}) => void;
	/** Shows or hides the map image, e.g. hidden until the user picked a map. */
	setMapShown: (shown: boolean) => void;
	/**
	 * The whole map with everything on it as a PNG at the render's size, whatever the zoom. A
	 * label being typed is saved first, the selection is left out.
	 */
	exportImage: () => Promise<Blob>;
	/** Removes the stage and every listener from the page. */
	destroy: () => void;
}

/** Shows the editor's plan in `container`, filling it and following its size. */
export function create({
	container,
	editor,
	selection,
	tools,
	isMapShown: initialIsMapShown = true,
	onContextMenu,
}: {
	container: HTMLDivElement;
	editor: PlanEditor;
	selection: PlanSelection.PlanSelection;
	tools: PlanTools;
	/** `false` leaves the map blank (and its image unloaded) until {@link PlanCanvas.setMapShown}. */
	isMapShown?: boolean;
	/** A token, marker or drawing was right clicked (tokens and markers also long pressed) at a point of the page. */
	onContextMenu: (target: ContextMenuTarget, clientPoint: Point) => void;
}): PlanCanvas {
	const stage = new Konva.Stage({
		container,
		width: container.clientWidth,
		height: container.clientHeight,
	});
	const mapLayer = new Konva.Layer({ listening: false });
	const mapImage = new Konva.Image({
		image: undefined,
		width: MAP_SIZE.width,
		height: MAP_SIZE.height,
	});
	mapLayer.add(mapImage);
	const drawingLayer = new Konva.Layer();
	/** Radii, markers and tokens, in this order. Only markers and tokens listen. */
	const pieceLayer = new Konva.Layer();
	/** What the tools show over everything: the selection and its handles. */
	const overlayLayer = new Konva.Layer();
	// XXX: ink and objective layers go between the map and the drawings, callouts between the pieces and the overlay
	stage.add(mapLayer, drawingLayer, pieceLayer, overlayLayer);

	const viewport = (): PlanCamera.Viewport => ({
		width: stage.width(),
		height: stage.height(),
	});
	let camera = PlanCamera.fit(viewport());

	let drawings: DrawingLayer.DrawingLayer | null = null;
	let textEditor: TextEditor.TextEditor | null = null;
	const setCamera = (next: PlanCamera.Camera) => {
		const zoomChanged = next.scale !== camera.scale;
		camera = next;
		stage.scale({ x: camera.scale, y: camera.scale });
		stage.position({ x: camera.x, y: camera.y });
		if (zoomChanged) drawings?.onZoom();
		textEditor?.reposition();
	};

	let isMapShown = initialIsMapShown;
	mapImage.visible(isMapShown);

	let shownMapUrl: string | null = null;
	/** Settles once the map image shown has loaded, or failed to. */
	let mapImageLoaded = Promise.resolve();
	const showMap = (url: string) => {
		if (url === shownMapUrl) return;
		shownMapUrl = url;

		const image = new window.Image();
		image.crossOrigin = "anonymous";
		mapImageLoaded = new Promise((resolve) => {
			image.onload = () => {
				if (shownMapUrl === url) mapImage.image(image);
				resolve();
			};
			image.onerror = () => resolve();
		});
		image.src = url;
	};

	const render = (document: PlanDocument, previous?: PlanDocument) => {
		if (isMapShown) showMap(mapImageUrl(document));
		if (
			previous &&
			(previous.stageId !== document.stageId ||
				previous.variant !== document.variant)
		) {
			setCamera(PlanCamera.fit(viewport()));
		}
	};

	const unsubscribe = editor.subscribe(({ document, previous }) =>
		render(document, previous),
	);
	render(editor.getDocument());
	setCamera(camera);

	const resizeObserver = new ResizeObserver(() => {
		const wasFitted = PlanCamera.isFitted(camera, viewport());
		stage.size({
			width: container.clientWidth,
			height: container.clientHeight,
		});
		setCamera(
			wasFitted
				? PlanCamera.fit(viewport())
				: PlanCamera.clamp(camera, viewport()),
		);
	});
	resizeObserver.observe(container);

	const fitView = () => setCamera(PlanCamera.fit(viewport()));
	drawings = DrawingLayer.create({
		parent: drawingLayer,
		overlay: overlayLayer,
		editor,
		selection,
	});
	textEditor = TextEditor.create({
		container,
		editor,
		selection,
		tools,
		getCamera: () => camera,
		onEditingChange: (id) => drawings?.setHidden(id),
	});
	const toolContext: DrawingTools.ToolContext = {
		editor,
		selection,
		tools,
		drawings,
		textEditor,
		toMap: (point) => PlanCamera.toMap(camera, point),
		zoom: () => camera.scale,
	};
	const pointerInput = listenToPointerInput({
		container,
		getCamera: () => camera,
		setCamera: (next) => setCamera(PlanCamera.clamp(next, viewport())),
		viewport,
		fitView,
		toolCursor: () => TOOL_CURSORS[tools.get().tool],
		startToolGesture: (point, event) => {
			if (tools.get().tool === "select") {
				const [x, y] = point;
				if (
					drawings?.isOnHandle(point) ||
					pieceLayer.getIntersection({ x, y }) !== null
				) {
					return null;
				}
			}
			return DrawingTools.startGesture(toolContext, point, event);
		},
	});
	/** Tokens and markers are dragged with the select tool, every other tool draws over them. */
	const canGrabPieces = () =>
		!pointerInput.isPanning() && tools.get().tool === "select";

	const onDoubleClick = (event: MouseEvent) => {
		if (tools.get().tool !== "select" || isOnTextField(event)) return;

		const point = localPoint(container, event);
		if (pieceLayer.getIntersection({ x: point[0], y: point[1] })) return;

		const id = drawings?.drawingAt(point);
		if (id) textEditor?.openExisting(id);
	};
	container.addEventListener("dblclick", onDoubleClick);

	/**
	 * A right click on a drawing opens the menu of the selection when it is part of it, otherwise
	 * of the drawing alone, selecting it with the select tool. Tokens and markers open their own.
	 */
	const onDrawingContextMenu = (event: MouseEvent) => {
		if (isOnTextField(event)) return;

		const point = localPoint(container, event);
		if (pieceLayer.getIntersection({ x: point[0], y: point[1] })) return;

		const id = drawings?.drawingAt(point);
		if (!id) return;

		const selectedIds = PlanSelection.selectedDrawingIds(selection.get());
		const ids = selectedIds.includes(id) ? selectedIds : [id];
		if (tools.get().tool === "select") {
			selection.set({ type: "drawings", ids });
		}
		onContextMenu({ type: "drawings", ids }, [event.clientX, event.clientY]);
	};
	container.addEventListener("contextmenu", onDrawingContextMenu);

	const onKeyDown = (event: KeyboardEvent) => {
		if (isTyping(event)) return;

		if (event.key === "Escape") {
			if (!pointerInput.cancelToolGesture()) selection.set(null);
			return;
		}
		if (event.key !== "Delete" && event.key !== "Backspace") return;

		const ids = PlanSelection.selectedDrawingIds(selection.get());
		if (ids.length === 0) return;

		event.preventDefault();
		editor.apply(PlanCommands.removeDrawings(editor.getDocument(), ids));
	};
	window.addEventListener("keydown", onKeyDown);

	let toolInHand = tools.get().tool;
	const unsubscribeTools = tools.subscribe(() => {
		const { tool } = tools.get();
		if (tool === toolInHand) return;

		toolInHand = tool;
		textEditor?.close();
		pointerInput.cancelToolGesture();
		pointerInput.updateCursor();
		if (tool !== "select" && selection.get()?.type === "drawings") {
			selection.set(null);
		}
	});

	const radiusLayer = RadiusLayer.create({
		parent: pieceLayer,
		editor,
	});
	const markerLayer = MarkerLayer.create({
		parent: pieceLayer,
		editor,
		isPanning: pointerInput.isPanning,
		canGrab: canGrabPieces,
		onContextMenu: (id, clientPoint) =>
			onContextMenu({ type: "marker", id }, clientPoint),
	});
	const tokenLayer = TokenLayer.create({
		parent: pieceLayer,
		editor,
		selection,
		isPanning: pointerInput.isPanning,
		canGrab: canGrabPieces,
		onContextMenu: (slot, clientPoint) =>
			onContextMenu({ type: "player", slot }, clientPoint),
	});

	/** The map point under a point of the page, `null` off the canvas or off the map. */
	const clientToMap = ([clientX, clientY]: Point): Point | null => {
		const rect = container.getBoundingClientRect();
		const containerPoint: Point = [clientX - rect.left, clientY - rect.top];
		if (
			containerPoint[0] < 0 ||
			containerPoint[1] < 0 ||
			containerPoint[0] > rect.width ||
			containerPoint[1] > rect.height
		) {
			return null;
		}

		const [x, y] = PlanCamera.toMap(camera, containerPoint);
		if (x < 0 || y < 0 || x > MAP_SIZE.width || y > MAP_SIZE.height) {
			return null;
		}
		return [x, y];
	};

	const dragNewPlayer: PlanCanvas["dragNewPlayer"] = ({
		slot,
		weaponId,
		clientPoint,
	}) => {
		editor.beginGroup();
		editor.apply(
			PlanCommands.setWeapon(editor.getDocument(), slot, weaponId, {
				onMap: false,
			}),
		);
		selection.set({ type: "player", slot });

		const player = editor.getDocument().slots[slot];
		if (!player) {
			editor.endGroup();
			return;
		}

		const rect = container.getBoundingClientRect();
		const team = teamOfSlot(slot);
		const ghost = TokenGhost.create({
			player,
			isEnemy: team === 1,
			teamColor: editor.getDocument().teams[team].color,
			scale: camera.scale,
			pixelOrigin: [rect.left, rect.top],
		});
		/** Over the map the ghost sits exactly where the token will be dropped, on whole map pixels. */
		const dropPointOf = (pointer: Point) => {
			const mapPoint = clientToMap(pointer);
			if (!mapPoint) return { mapPoint: null, ghostCenter: pointer };

			const rounded: Point = [Math.round(mapPoint[0]), Math.round(mapPoint[1])];
			return {
				mapPoint: rounded,
				ghostCenter: [
					rect.left + camera.x + rounded[0] * camera.scale,
					rect.top + camera.y + rounded[1] * camera.scale,
				] as Point,
			};
		};
		ghost.moveTo(dropPointOf(clientPoint).ghostCenter);
		const previousCursor = document.documentElement.style.cursor;
		document.documentElement.style.cursor = "grabbing";

		const onMove = (event: PointerEvent) =>
			ghost.moveTo(dropPointOf([event.clientX, event.clientY]).ghostCenter);
		const onEnd = (event: PointerEvent) => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onEnd);
			window.removeEventListener("pointercancel", onEnd);
			document.documentElement.style.cursor = previousCursor;

			const position =
				event.type === "pointerup"
					? dropPointOf([event.clientX, event.clientY]).mapPoint
					: null;
			editor.apply(
				PlanCommands.placePlayer(
					editor.getDocument(),
					slot,
					position ?? undefined,
				),
			);
			editor.endGroup();
			// the token layer draws in the next animation frame, the ghost goes in that same frame
			requestAnimationFrame(() => ghost.destroy());
		};

		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onEnd);
		window.addEventListener("pointercancel", onEnd);
	};

	return {
		fitView,
		centerOn: (point) => {
			if (PlanCamera.isFitted(camera, viewport())) return;
			setCamera(PlanCamera.centerOn(camera, viewport(), point));
		},
		dragNewPlayer,
		setMapShown: (shown) => {
			isMapShown = shown;
			mapImage.visible(shown);
			if (shown) showMap(mapImageUrl(editor.getDocument()));
		},
		exportImage: async () => {
			textEditor?.close();
			await mapImageLoaded;

			overlayLayer.visible(false);
			stage.scale({ x: 1, y: 1 });
			stage.position({ x: 0, y: 0 });
			let image: HTMLCanvasElement;
			try {
				image = stage.toCanvas({
					x: 0,
					y: 0,
					width: MAP_SIZE.width,
					height: MAP_SIZE.height,
					pixelRatio: 1,
				});
			} finally {
				stage.scale({ x: camera.scale, y: camera.scale });
				stage.position({ x: camera.x, y: camera.y });
				overlayLayer.visible(true);
			}

			return new Promise((resolve, reject) =>
				image.toBlob(
					(blob) =>
						blob ? resolve(blob) : reject(new Error("Empty plan image")),
					"image/png",
				),
			);
		},
		destroy: () => {
			unsubscribe();
			unsubscribeTools();
			resizeObserver.disconnect();
			pointerInput.remove();
			container.removeEventListener("dblclick", onDoubleClick);
			container.removeEventListener("contextmenu", onDrawingContextMenu);
			window.removeEventListener("keydown", onKeyDown);
			textEditor?.destroy();
			drawings?.destroy();
			radiusLayer.destroy();
			markerLayer.destroy();
			tokenLayer.destroy();
			stage.destroy();
		},
	};
}

/** Today's minimap render of the plan's map, until maps have cutouts. */
function mapImageUrl(document: PlanDocument) {
	return stageMinimapImageUrlWithEnding({
		stageId: document.stageId,
		mode: document.objective.mode,
		style: "MINI",
		waterLevel: document.variant === "lowTide" ? "down" : "up",
	});
}

/**
 * Wheel zooms around the pointer, two pointers pinch and pan, and so do Space held or the middle
 * mouse button with one. Any other press with the left button or one finger goes to the tool in
 * hand (unless `startToolGesture` leaves it to Konva, e.g. to drag a token); a second finger
 * landing during it cancels it and pinches instead. The right button is left to context menus.
 * Shift+1 fits the map.
 */
function listenToPointerInput({
	container,
	getCamera,
	setCamera,
	viewport,
	fitView,
	toolCursor,
	startToolGesture,
}: {
	container: HTMLDivElement;
	getCamera: () => PlanCamera.Camera;
	setCamera: (camera: PlanCamera.Camera) => void;
	viewport: () => PlanCamera.Viewport;
	fitView: () => void;
	/** The cursor of the tool in hand. */
	toolCursor: () => string;
	/** The tool's gesture for a press at a container point, `null` to leave the press to Konva. */
	startToolGesture: (
		point: Point,
		event: PointerEvent,
	) => DrawingTools.Gesture | null;
}) {
	/** Pointers panning or pinching the camera, by pointer id. */
	const panPointers = new Map<number, Point>();
	let toolPress: {
		pointerId: number;
		gesture: DrawingTools.Gesture;
		last: Point;
	} | null = null;
	let spaceHeld = false;

	container.style.touchAction = "none";

	const updateCursor = () => {
		container.style.cursor =
			panPointers.size > 0 ? "grabbing" : spaceHeld ? "grab" : toolCursor();
	};

	const cancelToolGesture = () => {
		if (!toolPress) return false;

		toolPress.gesture.cancel();
		toolPress = null;
		return true;
	};

	const onWheel = (event: WheelEvent) => {
		event.preventDefault();

		const deltaY =
			event.deltaMode === WheelEvent.DOM_DELTA_LINE
				? event.deltaY * WHEEL_LINE_HEIGHT_PX
				: event.deltaY;
		const speed = event.ctrlKey ? PINCH_WHEEL_ZOOM_SPEED : WHEEL_ZOOM_SPEED;

		setCamera(
			PlanCamera.zoomAt(
				getCamera(),
				viewport(),
				localPoint(container, event),
				Math.exp(-deltaY * speed),
			),
		);
	};

	const onPointerDown = (event: PointerEvent) => {
		if (event.button === RIGHT_MOUSE_BUTTON || isOnTextField(event)) return;

		const point = localPoint(container, event);
		if (toolPress) {
			if (event.pointerType !== "touch") return;

			const { pointerId, last } = toolPress;
			cancelToolGesture();
			panPointers.set(pointerId, last);
		}

		const isPanButton = event.button === MIDDLE_MOUSE_BUTTON || spaceHeld;
		if (event.button === MIDDLE_MOUSE_BUTTON) event.preventDefault();

		if (!isPanButton && panPointers.size === 0) {
			const gesture = startToolGesture(point, event);
			if (!gesture) return;

			toolPress = { pointerId: event.pointerId, gesture, last: point };
			capturePointer(container, event.pointerId);
			return;
		}

		capturePointer(container, event.pointerId);
		panPointers.set(event.pointerId, point);
		updateCursor();
	};

	const onPointerMove = (event: PointerEvent) => {
		const after = localPoint(container, event);
		if (toolPress?.pointerId === event.pointerId) {
			toolPress.last = after;
			toolPress.gesture.move(after);
			return;
		}

		const before = panPointers.get(event.pointerId);
		if (!before) return;

		const others = [...panPointers].filter(([id]) => id !== event.pointerId);
		panPointers.set(event.pointerId, after);

		if (others.length === 0) {
			setCamera(
				PlanCamera.panBy(getCamera(), viewport(), [
					after[0] - before[0],
					after[1] - before[1],
				]),
			);
			return;
		}

		const [, other] = others[0];
		const centerBefore = midpoint(before, other);
		const centerAfter = midpoint(after, other);
		const panned = PlanCamera.panBy(getCamera(), viewport(), [
			centerAfter[0] - centerBefore[0],
			centerAfter[1] - centerBefore[1],
		]);
		setCamera(
			PlanCamera.zoomAt(
				panned,
				viewport(),
				centerAfter,
				distance(after, other) / Math.max(distance(before, other), 1),
			),
		);
	};

	const onPointerEnd = (event: PointerEvent) => {
		if (toolPress?.pointerId === event.pointerId) {
			const { gesture } = toolPress;
			toolPress = null;
			if (event.type === "pointerup") gesture.end(localPoint(container, event));
			else gesture.cancel();
			return;
		}

		if (!panPointers.delete(event.pointerId)) return;
		updateCursor();
	};

	const onKeyDown = (event: KeyboardEvent) => {
		if (isTyping(event)) return;

		if (event.code === "Digit1" && event.shiftKey) {
			fitView();
			return;
		}
		if (event.code !== "Space" || isOnButton(event)) return;

		event.preventDefault();
		spaceHeld = true;
		updateCursor();
	};

	const onKeyUp = (event: KeyboardEvent) => {
		if (event.code !== "Space") return;

		spaceHeld = false;
		updateCursor();
	};

	const onBlur = () => {
		spaceHeld = false;
		updateCursor();
	};

	const onContextMenu = (event: MouseEvent) => {
		if (!isOnTextField(event)) event.preventDefault();
	};

	container.addEventListener("wheel", onWheel, { passive: false });
	container.addEventListener("pointerdown", onPointerDown);
	container.addEventListener("pointermove", onPointerMove);
	container.addEventListener("pointerup", onPointerEnd);
	container.addEventListener("pointercancel", onPointerEnd);
	container.addEventListener("contextmenu", onContextMenu);
	window.addEventListener("keydown", onKeyDown);
	window.addEventListener("keyup", onKeyUp);
	window.addEventListener("blur", onBlur);
	updateCursor();

	return {
		/** Whether the pointer pans whatever it is over right now. */
		isPanning: () => spaceHeld,
		updateCursor,
		/** Stops the tool's press under way, returning whether there was one. */
		cancelToolGesture,
		remove: () => {
			container.removeEventListener("wheel", onWheel);
			container.removeEventListener("pointerdown", onPointerDown);
			container.removeEventListener("pointermove", onPointerMove);
			container.removeEventListener("pointerup", onPointerEnd);
			container.removeEventListener("pointercancel", onPointerEnd);
			container.removeEventListener("contextmenu", onContextMenu);
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("blur", onBlur);
		},
	};
}

/** A point of the page as a point of the container. */
function localPoint(container: HTMLElement, event: MouseEvent): Point {
	const rect = container.getBoundingClientRect();
	return [event.clientX - rect.left, event.clientY - rect.top];
}

/** Whether the event happened in a label's text field, which handles its own pointer and menu. */
function isOnTextField(event: Event) {
	return (
		event.target instanceof HTMLElement &&
		event.target.closest("textarea") !== null
	);
}

/** Keeps the pointer's events coming while it is outside the container, unless it is already gone. */
function capturePointer(container: HTMLElement, pointerId: number) {
	try {
		container.setPointerCapture(pointerId);
	} catch {
		// released before its pointerdown reached us
	}
}

function isTyping(event: KeyboardEvent) {
	const target = event.target;
	if (!(target instanceof HTMLElement)) return false;

	return (
		target.isContentEditable ||
		target.closest("input, textarea, select, [popover], dialog") !== null
	);
}

/** Space presses a focused button or link, so it doesn't start a pan there. */
function isOnButton(event: KeyboardEvent) {
	return (
		event.target instanceof HTMLElement &&
		event.target.closest("button, a") !== null
	);
}

function midpoint([ax, ay]: Point, [bx, by]: Point): Point {
	return [(ax + bx) / 2, (ay + by) / 2];
}

function distance([ax, ay]: Point, [bx, by]: Point) {
	return Math.hypot(ax - bx, ay - by);
}
