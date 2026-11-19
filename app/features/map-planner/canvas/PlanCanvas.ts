// Draws a plan on a Konva stage inside a container element and redraws it
// on every change of the editor's document. Plain Konva and DOM, no React,
// so any UI framework can host it. Owns the camera: wheel and pinch zoom,
// pans by dragging, never past the map's edges.

import Konva from "konva";
import { stageMinimapImageUrlWithEnding } from "~/utils/urls";
import * as PlanCamera from "../core/PlanCamera";
import { MAP_SIZE, type PlanDocument, type Point } from "../core/PlanDocument";
import type { PlanEditor } from "../core/PlanEditor";

const WHEEL_ZOOM_SPEED = 0.002;
/** Trackpad pinches arrive as wheel events with small deltas and `ctrlKey` set. */
const PINCH_WHEEL_ZOOM_SPEED = 0.01;
const WHEEL_LINE_HEIGHT_PX = 16;
const MIDDLE_MOUSE_BUTTON = 1;

/** See {@link create}. */
export interface PlanCanvas {
	/** Shows the whole map. */
	fitView: () => void;
	/** Removes the stage and every listener from the page. */
	destroy: () => void;
}

/** Shows the editor's plan in `container`, filling it and following its size. */
export function create({
	container,
	editor,
}: {
	container: HTMLDivElement;
	editor: PlanEditor;
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
	stage.add(mapLayer);

	const viewport = (): PlanCamera.Viewport => ({
		width: stage.width(),
		height: stage.height(),
	});
	let camera = PlanCamera.fit(viewport());

	const setCamera = (next: PlanCamera.Camera) => {
		camera = next;
		stage.scale({ x: camera.scale, y: camera.scale });
		stage.position({ x: camera.x, y: camera.y });
	};

	let shownMapUrl: string | null = null;
	const showMap = (url: string) => {
		if (url === shownMapUrl) return;
		shownMapUrl = url;

		const image = new window.Image();
		image.crossOrigin = "anonymous";
		image.onload = () => {
			if (shownMapUrl !== url) return;
			mapImage.image(image);
		};
		image.src = url;
	};

	const render = (document: PlanDocument, previous?: PlanDocument) => {
		showMap(mapImageUrl(document));
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
	const removeCameraInput = listenToCameraInput({
		container,
		getCamera: () => camera,
		setCamera: (next) => setCamera(PlanCamera.clamp(next, viewport())),
		viewport,
		fitView,
	});

	return {
		fitView,
		destroy: () => {
			unsubscribe();
			resizeObserver.disconnect();
			removeCameraInput();
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
 * Wheel zooms around the pointer; dragging with one pointer pans, with two it pinches. Space held
 * or the middle mouse button pan whatever the pointer is over. Shift+1 fits the map.
 */
function listenToCameraInput({
	container,
	getCamera,
	setCamera,
	viewport,
	fitView,
}: {
	container: HTMLDivElement;
	getCamera: () => PlanCamera.Camera;
	setCamera: (camera: PlanCamera.Camera) => void;
	viewport: () => PlanCamera.Viewport;
	fitView: () => void;
}) {
	const pointers = new Map<number, Point>();
	let spaceHeld = false;

	container.style.touchAction = "none";

	const localPoint = (event: MouseEvent): Point => {
		const rect = container.getBoundingClientRect();
		return [event.clientX - rect.left, event.clientY - rect.top];
	};

	const updateCursor = () => {
		container.style.cursor =
			pointers.size > 0 ? "grabbing" : spaceHeld ? "grab" : "";
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
				localPoint(event),
				Math.exp(-deltaY * speed),
			),
		);
	};

	const onPointerDown = (event: PointerEvent) => {
		if (event.button === MIDDLE_MOUSE_BUTTON) event.preventDefault();

		container.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, localPoint(event));
		updateCursor();
	};

	const onPointerMove = (event: PointerEvent) => {
		const before = pointers.get(event.pointerId);
		if (!before) return;

		const others = [...pointers].filter(([id]) => id !== event.pointerId);
		const after = localPoint(event);
		pointers.set(event.pointerId, after);

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
		pointers.delete(event.pointerId);
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

	container.addEventListener("wheel", onWheel, { passive: false });
	container.addEventListener("pointerdown", onPointerDown);
	container.addEventListener("pointermove", onPointerMove);
	container.addEventListener("pointerup", onPointerEnd);
	container.addEventListener("pointercancel", onPointerEnd);
	window.addEventListener("keydown", onKeyDown);
	window.addEventListener("keyup", onKeyUp);
	window.addEventListener("blur", onBlur);

	return () => {
		container.removeEventListener("wheel", onWheel);
		container.removeEventListener("pointerdown", onPointerDown);
		container.removeEventListener("pointermove", onPointerMove);
		container.removeEventListener("pointerup", onPointerEnd);
		container.removeEventListener("pointercancel", onPointerEnd);
		window.removeEventListener("keydown", onKeyDown);
		window.removeEventListener("keyup", onKeyUp);
		window.removeEventListener("blur", onBlur);
	};
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
