// A token following the pointer while it is dragged onto the map, drawn over
// the whole page so it shows above the slot bar too. A small Konva stage of
// its own drawing the token with `TokenLook`, at the zoom of the map, so it
// has exactly the pixels the token will have once dropped.

import Konva from "konva";
import type { PlanPlayer, Point } from "../core/PlanDocument";
import * as TokenLook from "./TokenLook";

const GHOST_Z_INDEX = "1000";

/** See {@link create}. */
export interface TokenGhost {
	/** Centers the token on a point of the page. */
	moveTo: (clientPoint: Point) => void;
	destroy: () => void;
}

/**
 * Shows the player's token at `scale` screen pixels per map pixel. `pixelOrigin` is where the
 * map canvas starts on the page: the ghost is kept on the same pixel grid as the canvas, so a
 * token at the same point looks identical on both.
 */
export function create({
	player,
	isEnemy,
	scale,
	pixelOrigin,
}: {
	player: PlanPlayer;
	isEnemy: boolean;
	scale: number;
	pixelOrigin: Point;
}): TokenGhost {
	const half = Math.ceil(TokenLook.TOKEN_EXTENT * scale) + 1;
	const container = document.createElement("div");
	Object.assign(container.style, {
		position: "fixed",
		left: "0",
		top: "0",
		pointerEvents: "none",
		zIndex: GHOST_Z_INDEX,
	});
	document.body.append(container);

	const stage = new Konva.Stage({
		container,
		width: half * 2,
		height: half * 2,
		listening: false,
	});
	const layer = new Konva.Layer({ listening: false });
	const group = new Konva.Group({ scaleX: scale, scaleY: scale });
	const parts = TokenLook.createParts();
	group.add(parts.image, parts.pointer);
	layer.add(group);
	stage.add(layer);

	let isDestroyed = false;
	const show = () => {
		if (isDestroyed) return;
		const loading = TokenLook.update(parts, {
			player,
			isEnemy,
			isSelected: true,
		});
		loading?.addEventListener("load", show, { once: true });
	};
	show();

	return {
		moveTo: ([x, y]) => {
			const offsetX = Math.floor(x - pixelOrigin[0] - half);
			const offsetY = Math.floor(y - pixelOrigin[1] - half);
			container.style.transform = `translate(${pixelOrigin[0] + offsetX}px, ${pixelOrigin[1] + offsetY}px)`;
			group.position({
				x: x - pixelOrigin[0] - offsetX,
				y: y - pixelOrigin[1] - offsetY,
			});
		},
		destroy: () => {
			isDestroyed = true;
			stage.destroy();
			container.remove();
		},
	};
}
