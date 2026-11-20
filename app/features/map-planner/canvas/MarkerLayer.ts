// Thrown subs and placed specials: the owner's sub or special on a dark disc
// ringed in their team's colour. Dragged like tokens, one undo step per drag; a right
// click or a long press opens the marker's context menu. Plain Konva, no React.

import Konva from "konva";
import { specialWeaponImageUrl, subWeaponImageUrl } from "~/utils/urls";
import * as PlanCommands from "../core/PlanCommands";
import {
	type PlanDocument,
	type PlanMarker,
	type Point,
	teamOfSlot,
} from "../core/PlanDocument";
import type { PlanEditor } from "../core/PlanEditor";
import * as PlanKit from "../core/PlanKit";
import * as LongPress from "./LongPress";
import * as TokenLook from "./TokenLook";

const LEFT_MOUSE_BUTTON = 0;
/** Radius of a marker's disc in map coordinates. */
const MARKER_RADIUS = 17;
const MARKER_IMAGE_SIZE = 26;
const DISC_COLOR = "rgba(16, 16, 24, 0.85)";
const RING_WIDTH = 3;

/** See {@link create}. */
export interface MarkerLayer {
	destroy: () => void;
}

interface MarkerNode {
	group: Konva.Group;
	disc: Konva.Circle;
	image: Konva.Image;
}

/** Adds the markers to `parent`, drawing the editor's markers. */
export function create({
	parent,
	editor,
	isPanning,
	onContextMenu,
}: {
	parent: Konva.Container;
	editor: PlanEditor;
	/** Whether the pointer pans the camera now (e.g. Space held), so markers don't drag. */
	isPanning: () => boolean;
	/** The marker of `id` was right clicked or long pressed at a point of the page. */
	onContextMenu: (id: string, clientPoint: Point) => void;
}): MarkerLayer {
	const root = new Konva.Group();
	parent.add(root);
	const nodes = new Map<string, MarkerNode>();
	const loadingImages = new Set<HTMLImageElement>();
	let isDestroyed = false;

	const onImageLoad = (image: HTMLImageElement) => {
		loadingImages.delete(image);
		if (!isDestroyed) render();
	};

	const createNode = (id: string): MarkerNode => {
		const group = new Konva.Group({ draggable: true });
		const disc = new Konva.Circle({
			radius: MARKER_RADIUS,
			fill: DISC_COLOR,
			strokeWidth: RING_WIDTH,
		});
		const image = new Konva.Image({
			image: undefined,
			width: MARKER_IMAGE_SIZE,
			height: MARKER_IMAGE_SIZE,
			offsetX: MARKER_IMAGE_SIZE / 2,
			offsetY: MARKER_IMAGE_SIZE / 2,
			listening: false,
		});
		group.add(disc, image);
		const longPress = LongPress.create((clientPoint) => {
			group.stopDrag();
			onContextMenu(id, clientPoint);
		});

		group.on("pointerdown", (event) => {
			if (!isPanning()) longPress.pointerDown(event.evt);
		});
		group.on("pointermove", (event) => longPress.pointerMove(event.evt));
		group.on("pointerup pointercancel", longPress.cancel);
		group.on("contextmenu", (event) => {
			event.evt.preventDefault();
			if (isPanning()) return;
			onContextMenu(id, [event.evt.clientX, event.evt.clientY]);
		});
		group.on("dragstart", (event) => {
			const button = (event.evt as MouseEvent | undefined)?.button;
			if (
				isPanning() ||
				longPress.didFire() ||
				(button !== undefined && button !== LEFT_MOUSE_BUTTON)
			) {
				group.stopDrag();
				return;
			}
			editor.beginGroup();
		});
		// Konva stops firing pointer events on a node it is dragging, so the drag feeds the long press
		group.on("dragmove", (event) => {
			longPress.pointerMove(event.evt);
			editor.apply(
				PlanCommands.moveMarker(editor.getDocument(), id, [
					group.x(),
					group.y(),
				]),
			);
			const position = editor
				.getDocument()
				.markers.find((marker) => marker.id === id)?.position;
			if (position) group.position({ x: position[0], y: position[1] });
		});
		group.on("dragend", () => {
			longPress.cancel();
			editor.endGroup();
		});
		group.on("mouseenter", () => {
			parent.getStage()!.container().style.cursor = "grab";
		});
		group.on("mouseleave", () => {
			parent.getStage()!.container().style.cursor = "";
		});

		root.add(group);
		return { group, disc, image };
	};

	const render = (document = editor.getDocument()) => {
		const shown = document.markers.filter(
			(marker) => document.slots[marker.owner],
		);
		const shownIds = new Set(shown.map((marker) => marker.id));
		for (const [id, node] of nodes) {
			if (shownIds.has(id)) continue;
			node.group.destroy();
			nodes.delete(id);
		}

		for (const marker of shown) {
			const node = nodes.get(marker.id) ?? createNode(marker.id);
			nodes.set(marker.id, node);
			if (!node.group.isDragging()) {
				node.group.position({ x: marker.position[0], y: marker.position[1] });
			}
			node.group.moveToTop();
			node.disc.stroke(document.teams[teamOfSlot(marker.owner)].color);

			const image = TokenLook.loadImage(imageUrl(marker, document));
			if (image.complete && image.naturalWidth > 0) {
				node.image.image(image);
			} else if (!loadingImages.has(image)) {
				loadingImages.add(image);
				image.addEventListener("load", () => onImageLoad(image), {
					once: true,
				});
			}
		}
	};

	const unsubscribe = editor.subscribe(({ document }) => render(document));
	render();

	return {
		destroy: () => {
			isDestroyed = true;
			unsubscribe();
			root.destroy();
		},
	};
}

function imageUrl(marker: PlanMarker, document: PlanDocument) {
	const weaponId = document.slots[marker.owner]!.weaponId;

	return marker.kind === "sub"
		? `${subWeaponImageUrl(PlanKit.subOf(weaponId))}.avif`
		: `${specialWeaponImageUrl(PlanKit.specialOf(weaponId))}.avif`;
}
