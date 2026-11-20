// How a token looks: the weapon (or the special while in special), plain for
// team A and tinted red for team B, the enemy, with a ▼ above it while
// selected. Shared by the token layer and the ghost dragged onto the map, so
// both draw exactly the same pixels. Plain Konva, no React.

import Konva from "konva";
import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import {
	outlinedMainWeaponImageUrl,
	specialWeaponImageUrl,
} from "~/utils/urls";
import type { PlanPlayer } from "../core/PlanDocument";

/** Width and height of a token's weapon image in map coordinates. */
const TOKEN_IMAGE_SIZE = 51;
/** Grabbable area around the token's center, in map coordinates. */
const TOKEN_RADIUS = 29;
/** The ▼ above the selected token: width, height and gap to the weapon image. */
const POINTER_SIZE = { width: 20, height: 14, gap: 2, cornerRadius: 3 };
const POINTER_STROKE_WIDTH = 2;
/** How far from the token's center anything of it is drawn, in map coordinates. */
export const TOKEN_EXTENT =
	TOKEN_IMAGE_SIZE / 2 +
	POINTER_SIZE.gap +
	POINTER_SIZE.height +
	POINTER_STROKE_WIDTH;
/** How far team B's tokens are blended towards {@link ENEMY_TINT}, `0–1`. */
const ENEMY_TINT_STRENGTH = 0.5;
const ENEMY_TINT = [255, 40, 40] as const;

/** Loaded images by url, shared so a token drawn anywhere finds its image already loaded. */
const images = new Map<string, HTMLImageElement>();

/** The Konva nodes of one token, centered on (0, 0), see {@link createParts}. */
export interface TokenParts {
	image: Konva.Image;
	pointer: Konva.Shape;
	/** What the image shows, to redraw it only when that changes. */
	shown: { url: string; isEnemy: boolean } | null;
}

/** A token's nodes, to add to a group positioned at its center. Shows nothing until {@link update}. */
export function createParts(): TokenParts {
	const pointerTipY = -TOKEN_IMAGE_SIZE / 2 - POINTER_SIZE.gap;
	const pointer = new Konva.Shape({
		sceneFunc: (context, shape) => {
			const top = pointerTipY - POINTER_SIZE.height;
			const halfWidth = POINTER_SIZE.width / 2;
			const radius = POINTER_SIZE.cornerRadius;
			context.beginPath();
			context.moveTo(0, top);
			context.arcTo(halfWidth, top, 0, pointerTipY, radius);
			context.arcTo(0, pointerTipY, -halfWidth, top, radius);
			context.arcTo(-halfWidth, top, halfWidth, top, radius);
			context.closePath();
			context.fillStrokeShape(shape);
		},
		fill: "#ffffff",
		stroke: "rgba(0, 0, 0, 0.75)",
		strokeWidth: POINTER_STROKE_WIDTH,
		lineJoin: "round",
		listening: false,
	});
	const image = new Konva.Image({
		image: undefined,
		width: TOKEN_IMAGE_SIZE,
		height: TOKEN_IMAGE_SIZE,
		offsetX: TOKEN_IMAGE_SIZE / 2,
		offsetY: TOKEN_IMAGE_SIZE / 2,
		hitFunc: (context, shape) => {
			context.beginPath();
			context.arc(
				TOKEN_IMAGE_SIZE / 2,
				TOKEN_IMAGE_SIZE / 2,
				TOKEN_RADIUS,
				0,
				Math.PI * 2,
			);
			context.closePath();
			context.fillStrokeShape(shape);
		},
	});

	return { image, pointer, shown: null };
}

/**
 * Shows the player's image, tinted for the enemy, and the ▼ when selected. Returns the image
 * element when it is still loading, to listen for its `load` and update again.
 */
export function update(
	parts: TokenParts,
	{
		player,
		isEnemy,
		isSelected,
	}: { player: PlanPlayer; isEnemy: boolean; isSelected: boolean },
): HTMLImageElement | null {
	parts.pointer.visible(isSelected);

	const url = imageUrl(player);
	const image = loadImage(url);
	if (!image.complete || image.naturalWidth === 0) return image;
	if (parts.shown?.url === url && parts.shown.isEnemy === isEnemy) return null;

	parts.image.image(image);
	parts.shown = { url, isEnemy };
	if (isEnemy) {
		parts.image.filters([enemyTint]);
		parts.image.cache({ pixelRatio: image.naturalWidth / TOKEN_IMAGE_SIZE });
	} else {
		parts.image.filters([]);
		parts.image.clearCache();
	}
	return null;
}

function imageUrl(player: PlanPlayer) {
	if (player.specialActive) {
		return `${specialWeaponImageUrl(mainWeaponParams(player.weaponId).specialWeaponId)}.avif`;
	}

	return `${outlinedMainWeaponImageUrl(player.weaponId)}.avif`;
}

function loadImage(url: string) {
	const cached = images.get(url);
	if (cached) return cached;

	const image = new window.Image();
	image.crossOrigin = "anonymous";
	image.src = url;
	images.set(url, image);
	return image;
}

function enemyTint(imageData: ImageData) {
	const { data } = imageData;
	for (let index = 0; index < data.length; index += 4) {
		for (let channel = 0; channel < 3; channel++) {
			data[index + channel] =
				data[index + channel] * (1 - ENEMY_TINT_STRENGTH) +
				ENEMY_TINT[channel] * ENEMY_TINT_STRENGTH;
		}
	}
}
