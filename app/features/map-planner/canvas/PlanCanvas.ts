// Draws a plan on a Konva stage inside a container element and redraws it
// on every change of the editor's document. Plain Konva and DOM, no React,
// so any UI framework can host it. Owns the camera: wheel and pinch zoom,
// pans by dragging the map, never past the map's edges.

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
import type { PlanSelection } from "../core/PlanSelection";
import * as MarkerLayer from "./MarkerLayer";
import * as RadiusLayer from "./RadiusLayer";
import * as TokenGhost from "./TokenGhost";
import * as TokenLayer from "./TokenLayer";

const WHEEL_ZOOM_SPEED = 0.002;
/** Trackpad pinches arrive as wheel events with small deltas and `ctrlKey` set. */
const PINCH_WHEEL_ZOOM_SPEED = 0.01;
const WHEEL_LINE_HEIGHT_PX = 16;
const MIDDLE_MOUSE_BUTTON = 1;
const RIGHT_MOUSE_BUTTON = 2;
/** How far a pointer may move between down and up for it to count as a tap, in screen pixels. */
const TAP_MAX_DISTANCE = 4;

/** What a context menu opened on the map is about. */
export type ContextMenuTarget =
	| { type: "player"; slot: SlotIndex }
	| { type: "marker"; id: string };

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
	/** Removes the stage and every listener from the page. */
	destroy: () => void;
}

/** Shows the editor's plan in `container`, filling it and following its size. */
export function create({
	container,
	editor,
	selection,
	isMapShown: initialIsMapShown = true,
	onContextMenu,
}: {
	container: HTMLDivElement;
	editor: PlanEditor;
	selection: PlanSelection;
	/** `false` leaves the map blank (and its image unloaded) until {@link PlanCanvas.setMapShown}. */
	isMapShown?: boolean;
	/** A token or marker was right clicked or long pressed at a point of the page. */
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
	/** Radii, markers and tokens, in this order. Only markers and tokens listen. */
	const pieceLayer = new Konva.Layer();
	stage.add(mapLayer, pieceLayer);

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

	let isMapShown = initialIsMapShown;
	mapImage.visible(isMapShown);

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
	const cameraInput = listenToCameraInput({
		container,
		getCamera: () => camera,
		setCamera: (next) => setCamera(PlanCamera.clamp(next, viewport())),
		viewport,
		fitView,
		isOnPiece: ([x, y]) => pieceLayer.getIntersection({ x, y }) !== null,
		onTapMap: () => selection.set(null),
	});
	const radiusLayer = RadiusLayer.create({
		parent: pieceLayer,
		editor,
	});
	const markerLayer = MarkerLayer.create({
		parent: pieceLayer,
		editor,
		isPanning: cameraInput.isPanning,
		onContextMenu: (id, clientPoint) =>
			onContextMenu({ type: "marker", id }, clientPoint),
	});
	const tokenLayer = TokenLayer.create({
		parent: pieceLayer,
		editor,
		selection,
		isPanning: cameraInput.isPanning,
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
		destroy: () => {
			unsubscribe();
			resizeObserver.disconnect();
			cameraInput.remove();
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
 * Wheel zooms around the pointer; dragging the map with one pointer pans, with two it pinches.
 * Space held or the middle mouse button pan whatever the pointer is over, tokens and markers
 * included. The right button is left to context menus. Shift+1 fits the map.
 */
function listenToCameraInput({
	container,
	getCamera,
	setCamera,
	viewport,
	fitView,
	isOnPiece,
	onTapMap,
}: {
	container: HTMLDivElement;
	getCamera: () => PlanCamera.Camera;
	setCamera: (camera: PlanCamera.Camera) => void;
	viewport: () => PlanCamera.Viewport;
	fitView: () => void;
	/** Whether a token or marker is under the container point, which the pointer then drags instead of panning. */
	isOnPiece: (point: Point) => boolean;
	/** A pointer went down and up on the map without moving, away from tokens and markers. */
	onTapMap: () => void;
}) {
	const pointers = new Map<number, Point>();
	let spaceHeld = false;
	let tapStart: Point | null = null;

	container.style.touchAction = "none";

	const localPoint = (event: MouseEvent): Point => {
		const rect = container.getBoundingClientRect();
		return [event.clientX - rect.left, event.clientY - rect.top];
	};

	/** A press that may still turn out to be a tap shows no grabbing cursor, so clicking the map doesn't flash it. */
	const updateCursor = () => {
		const isPanning = pointers.size > 0 && tapStart === null;
		container.style.cursor = isPanning ? "grabbing" : spaceHeld ? "grab" : "";
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
		if (event.button === RIGHT_MOUSE_BUTTON) return;

		const point = localPoint(event);
		const isPanButton = event.button === MIDDLE_MOUSE_BUTTON || spaceHeld;
		if (event.button === MIDDLE_MOUSE_BUTTON) event.preventDefault();
		if (!isPanButton && isOnPiece(point)) return;

		tapStart = pointers.size === 0 && !isPanButton ? point : null;
		container.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, point);
		updateCursor();
	};

	const onPointerMove = (event: PointerEvent) => {
		const before = pointers.get(event.pointerId);
		if (!before) return;

		const others = [...pointers].filter(([id]) => id !== event.pointerId);
		const after = localPoint(event);
		pointers.set(event.pointerId, after);
		if (
			others.length > 0 ||
			(tapStart && distance(tapStart, after) > TAP_MAX_DISTANCE)
		) {
			tapStart = null;
			updateCursor();
		}

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
		if (!pointers.delete(event.pointerId)) return;

		if (event.type === "pointerup" && tapStart && pointers.size === 0) {
			onTapMap();
		}
		tapStart = null;
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

	const onContextMenu = (event: MouseEvent) => event.preventDefault();

	container.addEventListener("wheel", onWheel, { passive: false });
	container.addEventListener("pointerdown", onPointerDown);
	container.addEventListener("pointermove", onPointerMove);
	container.addEventListener("pointerup", onPointerEnd);
	container.addEventListener("pointercancel", onPointerEnd);
	container.addEventListener("contextmenu", onContextMenu);
	window.addEventListener("keydown", onKeyDown);
	window.addEventListener("keyup", onKeyUp);
	window.addEventListener("blur", onBlur);

	return {
		/** Whether the pointer pans whatever it is over right now. */
		isPanning: () => spaceHeld,
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
