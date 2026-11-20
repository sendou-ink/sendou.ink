// The players' tokens on the map, looking as `TokenLook` draws them. Dragging
// a token moves the player, one undo step per drag. Plain Konva, no React.

import Konva from "konva";
import * as PlanCommands from "../core/PlanCommands";
import { type Point, type SlotIndex, teamOfSlot } from "../core/PlanDocument";
import type { PlanEditor } from "../core/PlanEditor";
import * as PlanSelection from "../core/PlanSelection";
import * as TokenLook from "./TokenLook";

const LEFT_MOUSE_BUTTON = 0;

/** See {@link create}. */
export interface TokenLayer {
	/** Whether a token is under the point, in pixels of the stage's container. Only tokens listen on this layer. */
	hitsToken: (point: Point) => boolean;
	destroy: () => void;
}

interface Token {
	group: Konva.Group;
	parts: TokenLook.TokenParts;
}

/** Adds the token layer to `stage`, drawing the editor's players and the selection. */
export function create({
	stage,
	editor,
	selection,
	isPanning,
}: {
	stage: Konva.Stage;
	editor: PlanEditor;
	selection: PlanSelection.PlanSelection;
	/** Whether the pointer pans the camera now (e.g. Space held), so tokens don't drag. */
	isPanning: () => boolean;
}): TokenLayer {
	const layer = new Konva.Layer();
	stage.add(layer);
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
		group.add(parts.image, parts.pointer);

		group.on("pointerdown", () => {
			if (isPanning()) return;
			selection.set({ type: "player", slot });
		});
		group.on("dragstart", (event) => {
			const button = (event.evt as MouseEvent | undefined)?.button;
			if (
				isPanning() ||
				(button !== undefined && button !== LEFT_MOUSE_BUTTON)
			) {
				group.stopDrag();
				return;
			}
			editor.beginGroup();
			selection.set({ type: "player", slot });
		});
		group.on("dragmove", () => {
			const operations = PlanCommands.placePlayer(editor.getDocument(), slot, [
				group.x(),
				group.y(),
			]);
			editor.apply(operations);
			const position = editor.getDocument().slots[slot]?.position;
			if (position) group.position({ x: position[0], y: position[1] });
		});
		group.on("dragend", () => editor.endGroup());
		group.on("mouseenter", () => {
			stage.container().style.cursor = "grab";
		});
		group.on("mouseleave", () => {
			stage.container().style.cursor = "";
		});

		layer.add(group);
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
			const loading = TokenLook.update(token.parts, {
				player,
				isEnemy: teamOfSlot(slot) === 1,
				isSelected: selected === slot,
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
		hitsToken: ([x, y]) => layer.getIntersection({ x, y }) !== null,
		destroy: () => {
			isDestroyed = true;
			unsubscribeEditor();
			unsubscribeSelection();
			layer.destroy();
		},
	};
}
