// How a token looks: the weapon (or the special while in special, the weapon
// small at its bottom right), plain for team A and tinted red for team B, the enemy, with a ▼ above it while
// selected and its status on top: greyed with a cross when dead, dimmed over
// an ink ripple when sharking, a badge when jumping. Shared by the token layer
// and the ghost dragged onto the map, so both draw exactly the same pixels.
// Plain Konva, no React.

import Konva from "konva";
import {
	outlinedMainWeaponImageUrl,
	specialWeaponImageUrl,
} from "~/utils/urls";
import type { PlanPlayer } from "../core/PlanDocument";
import * as PlanKit from "../core/PlanKit";

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
const DEAD_OPACITY = 0.8;
const SHARKING_OPACITY = 0.45;
/** Half the length of a dead token's cross arms along each axis. */
const CROSS_HALF_SIZE = 17;
const CROSS_COLOR = "#ef4444";
const OUTLINE_COLOR = "rgba(0, 0, 0, 0.75)";
/** The ink ripple under a sharking token: rings of these half widths, flattened to look lying on the ground. */
const RIPPLE_RADII = [16, 27];
const RIPPLE_FLATTENING = 0.38;
const RIPPLE_CENTER_Y = 16;
/** The weapon shown small at the bottom right of a token in special: its center and size. */
const WEAPON_BADGE = { x: 17, y: 17, size: 26 };
/** The jumping badge at the token's top right. */
const JUMP_BADGE = { x: 19, y: -17, radius: 10 };

/** Loaded images by url, shared so a token drawn anywhere finds its image already loaded. */
const images = new Map<string, HTMLImageElement>();

/** The Konva nodes of one token, centered on (0, 0), see {@link createParts}. */
export interface TokenParts {
	/** Everything of the token, to add to a group positioned at its center. */
	nodes: Konva.Shape[];
	image: Konva.Image;
	weaponBadge: Konva.Image;
	pointer: Konva.Shape;
	cross: Konva.Shape;
	ripple: Konva.Shape;
	jumpBadge: Konva.Shape;
}

/** A token's nodes, see {@link TokenParts.nodes}. Shows nothing until {@link update}. */
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

	const weaponBadge = new Konva.Image({
		image: undefined,
		x: WEAPON_BADGE.x,
		y: WEAPON_BADGE.y,
		width: WEAPON_BADGE.size,
		height: WEAPON_BADGE.size,
		offsetX: WEAPON_BADGE.size / 2,
		offsetY: WEAPON_BADGE.size / 2,
		listening: false,
		visible: false,
	});

	const cross = new Konva.Shape({
		sceneFunc: (context) => {
			context.beginPath();
			context.moveTo(-CROSS_HALF_SIZE, -CROSS_HALF_SIZE);
			context.lineTo(CROSS_HALF_SIZE, CROSS_HALF_SIZE);
			context.moveTo(CROSS_HALF_SIZE, -CROSS_HALF_SIZE);
			context.lineTo(-CROSS_HALF_SIZE, CROSS_HALF_SIZE);
			context.lineCap = "round";
			context.strokeStyle = OUTLINE_COLOR;
			context.lineWidth = 9;
			context.stroke();
			context.strokeStyle = CROSS_COLOR;
			context.lineWidth = 5;
			context.stroke();
		},
		listening: false,
		visible: false,
	});
	const ripple = new Konva.Shape({
		sceneFunc: (context, shape) => {
			context.beginPath();
			for (const radius of RIPPLE_RADII) {
				context.moveTo(radius, RIPPLE_CENTER_Y);
				context.ellipse(
					0,
					RIPPLE_CENTER_Y,
					radius,
					radius * RIPPLE_FLATTENING,
					0,
					0,
					Math.PI * 2,
				);
			}
			context.strokeShape(shape);
		},
		strokeWidth: 3,
		listening: false,
		visible: false,
	});
	const jumpBadge = new Konva.Shape({
		sceneFunc: (context, shape) => {
			const { x, y, radius } = JUMP_BADGE;
			context.beginPath();
			context.arc(x, y, radius, 0, Math.PI * 2);
			context.closePath();
			context.fillStrokeShape(shape);

			context.beginPath();
			for (const chevronY of [y - 1, y + 4]) {
				context.moveTo(x - 4.5, chevronY);
				context.lineTo(x, chevronY - 4.5);
				context.lineTo(x + 4.5, chevronY);
			}
			context.lineCap = "round";
			context.lineJoin = "round";
			context.strokeStyle = "#ffffff";
			context.lineWidth = 2.25;
			context.stroke();
		},
		stroke: OUTLINE_COLOR,
		strokeWidth: 1.5,
		listening: false,
		visible: false,
	});

	return {
		nodes: [ripple, image, weaponBadge, cross, jumpBadge, pointer],
		image,
		weaponBadge,
		pointer,
		cross,
		ripple,
		jumpBadge,
	};
}

/**
 * Shows the player's image, tinted for the enemy, its status and the ▼ when selected. Returns
 * an image element still loading, to listen for its `load` and update again.
 */
export function update(
	parts: TokenParts,
	{
		player,
		isEnemy,
		isSelected,
		teamColor,
	}: {
		player: PlanPlayer;
		isEnemy: boolean;
		isSelected: boolean;
		/** `#rrggbb` of the player's team, for the ripple and the badge. */
		teamColor: string;
	},
): HTMLImageElement | null {
	const isDead = player.status === "dead";
	parts.pointer.visible(isSelected);
	parts.cross.visible(isDead);
	parts.ripple.visible(player.status === "sharking");
	parts.ripple.stroke(teamColor);
	parts.jumpBadge.visible(player.status === "jumping");
	parts.jumpBadge.fill(teamColor);
	const opacity = isDead
		? DEAD_OPACITY
		: player.status === "sharking"
			? SHARKING_OPACITY
			: 1;
	parts.image.opacity(opacity);
	parts.weaponBadge.visible(player.specialActive);
	parts.weaponBadge.opacity(opacity);

	const weaponUrl = `${outlinedMainWeaponImageUrl(player.weaponId)}.avif`;
	const loading = showImage(parts.image, {
		url: player.specialActive
			? `${specialWeaponImageUrl(PlanKit.specialOf(player.weaponId))}.avif`
			: weaponUrl,
		isEnemy,
		isDead,
	});
	const badgeLoading = player.specialActive
		? showImage(parts.weaponBadge, { url: weaponUrl, isEnemy, isDead })
		: null;
	return loading ?? badgeLoading;
}

/** The image at `url`, loaded once and shared by everything drawn on a canvas, CORS-enabled so the canvas stays readable. */
export function loadImage(url: string) {
	const cached = images.get(url);
	if (cached) return cached;

	const image = new window.Image();
	image.crossOrigin = "anonymous";
	image.src = url;
	images.set(url, image);
	return image;
}

/** Puts the image on the node, greyed and tinted as asked, unless it already shows that. */
function showImage(
	node: Konva.Image,
	{ url, isEnemy, isDead }: { url: string; isEnemy: boolean; isDead: boolean },
) {
	const image = loadImage(url);
	if (!image.complete || image.naturalWidth === 0) return image;

	const shownKey = `${url}|${isEnemy}|${isDead}`;
	if (node.getAttr("shownKey") === shownKey) return null;
	node.setAttr("shownKey", shownKey);

	node.image(image);
	const filters = [
		...(isDead ? [Konva.Filters.Grayscale] : []),
		...(isEnemy ? [enemyTint] : []),
	];
	node.filters(filters);
	if (filters.length > 0) {
		node.cache({ pixelRatio: image.naturalWidth / node.width() });
	} else {
		node.clearCache();
	}
	return null;
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
