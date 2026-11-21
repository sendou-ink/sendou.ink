// The players' tokens on the map, looking as `TokenLook` draws them. Dragging
// a token moves the player, one undo step per drag; a right click or a long
// press opens its context menu. Plain Konva, no React.

import Konva from "konva";
import * as PlanCommands from "../core/PlanCommands";
import { type Point, type SlotIndex, teamOfSlot } from "../core/PlanDocument";
import type { PlanEditor } from "../core/PlanEditor";
import * as PlanSelection from "../core/PlanSelection";
import * as LongPress from "./LongPress";
import * as TokenLook from "./TokenLook";

const LEFT_MOUSE_BUTTON = 0;

/** See {@link create}. */
export interface TokenLayer {
	destroy: () => void;
}

interface Token {
	group: Konva.Group;
	parts: TokenLook.TokenParts;
}

/** Adds the tokens to `parent`, drawing the editor's players and the selection. */
export function create({
	parent,
	editor,
	selection,
	isPanning,
	canGrab,
	onContextMenu,
}: {
	parent: Konva.Container;
	editor: PlanEditor;
	selection: PlanSelection.PlanSelection;
	/** Whether the pointer pans the camera now (e.g. Space held), so tokens don't open their menu. */
	isPanning: () => boolean;
	/** Whether tokens can be selected and dragged now, not while panning or drawing over them. */
	canGrab: () => boolean;
	/** The token of `slot` was right clicked or long pressed at a point of the page. */
	onContextMenu: (slot: SlotIndex, clientPoint: Point) => void;
}): TokenLayer {
	const root = new Konva.Group();
	parent.add(root);
	const tokens = new Map<SlotIndex, Token>();
	const loadingImages = new Set<HTMLImageElement>();
	let isDestroyed = false;

	const onImageLoad = (image: HTMLImageElement) => {
		loadingImages.delete(image);
		if (!isDestroyed) render();
	};

	const createToken = (slot: SlotIndex): Token => {
		const group = new Konva.Group({ draggable: true });
		const parts = TokenLook.createParts();
		group.add(...parts.nodes);
		const longPress = LongPress.create((clientPoint) => {
			group.stopDrag();
			onContextMenu(slot, clientPoint);
		});

		group.on("pointerdown", (event) => {
			if (!canGrab()) return;
			selection.set({ type: "player", slot });
			longPress.pointerDown(event.evt);
		});
		group.on("pointermove", (event) => longPress.pointerMove(event.evt));
		group.on("pointerup pointercancel", longPress.cancel);
		group.on("contextmenu", (event) => {
			event.evt.preventDefault();
			if (isPanning()) return;
			if (canGrab()) selection.set({ type: "player", slot });
			onContextMenu(slot, [event.evt.clientX, event.evt.clientY]);
		});
		group.on("dragstart", (event) => {
			const button = (event.evt as MouseEvent | undefined)?.button;
			if (
				!canGrab() ||
				longPress.didFire() ||
				(button !== undefined && button !== LEFT_MOUSE_BUTTON)
			) {
				group.stopDrag();
				return;
			}
			editor.beginGroup();
			selection.set({ type: "player", slot });
		});
		// Konva stops firing pointer events on a node it is dragging, so the drag feeds the long press
		group.on("dragmove", (event) => {
			longPress.pointerMove(event.evt);
			const operations = PlanCommands.placePlayer(editor.getDocument(), slot, [
				group.x(),
				group.y(),
			]);
			editor.apply(operations);
			const position = editor.getDocument().slots[slot]?.position;
			if (position) group.position({ x: position[0], y: position[1] });
		});
		group.on("dragend", () => {
			longPress.cancel();
			editor.endGroup();
		});
		group.on("mouseenter", () => {
			if (canGrab()) parent.getStage()!.container().style.cursor = "grab";
		});
		group.on("mouseleave", () => {
			if (canGrab()) parent.getStage()!.container().style.cursor = "";
		});

		root.add(group);
		return { group, parts };
	};

	const render = (document = editor.getDocument()) => {
		const selected = PlanSelection.selectedSlot(selection.get());

		for (const [index, player] of document.slots.entries()) {
			const slot = index as SlotIndex;
			const position = player && !player.hidden ? player.position : null;
			const existing = tokens.get(slot);

			if (!player || !position) {
				if (existing) {
					existing.group.destroy();
					tokens.delete(slot);
				}
				continue;
			}

			const token = existing ?? createToken(slot);
			tokens.set(slot, token);
			if (!token.group.isDragging()) {
				token.group.position({ x: position[0], y: position[1] });
			}
			const team = teamOfSlot(slot);
			const loading = TokenLook.update(token.parts, {
				player,
				isEnemy: team === 1,
				isSelected: selected === slot,
				teamColor: document.teams[team].color,
			});
			if (loading && !loadingImages.has(loading)) {
				loadingImages.add(loading);
				loading.addEventListener("load", () => onImageLoad(loading), {
					once: true,
				});
			}
		}

		if (selected !== null) tokens.get(selected)?.group.moveToTop();
	};

	const unsubscribeEditor = editor.subscribe(({ document }) =>
		render(document),
	);
	const unsubscribeSelection = selection.subscribe(() => render());
	render();

	return {
		destroy: () => {
			isDestroyed = true;
			unsubscribeEditor();
			unsubscribeSelection();
			root.destroy();
		},
	};
}
