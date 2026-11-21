// User actions expressed as the operations they apply, often on more than one
// object. Applied together through the editor they are one undo step.

import { stagesObj } from "~/modules/in-game-lists/stage-ids";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import {
	DRAWING_TEXT_MAX_LENGTH,
	type DrawingSize,
	emptyObjective,
	MAP_SIZE,
	type MapVariant,
	newId,
	newPlayer,
	type PlanDocument,
	type PlanDrawing,
	type PlanMarker,
	type PlayerStatus,
	type Point,
	SLOTS_PER_TEAM,
	type SlotIndex,
	TEXT_SCALE_LIMITS,
	teamOfSlot,
} from "./PlanDocument";
import * as PlanGeometry from "./PlanGeometry";
import * as PlanKit from "./PlanKit";
import type { PlanOperation } from "./PlanOperation";

/** Distance from the render's left (team A) or right (team B) edge of tokens placed without a position. */
const TEAM_SIDE_INSET = 80;
/** Vertical distance between the tokens of one team placed without a position. */
const PLACED_TOKEN_SPACING = 140;
/** How far from its player's token a new marker lands. */
const MARKER_DISTANCE = 70;
/** Angle between the markers of one player, so a new one doesn't land on the last. */
const MARKER_ANGLE_STEP = Math.PI / 5;

/** The layout variants a stage has besides its standard one. */
export function variantsOfStage(stageId: StageId): MapVariant[] {
	return stageId === stagesObj.MAHI_MAHI_RESORT ? ["lowTide"] : [];
}

/**
 * Moves the plan to another map, or another layout of the same stage. The players stay in their
 * slots with their tokens back on their team's side (hidden ones staying hidden), and everything
 * drawn on the old map goes: markers, drawings, ink and the objective's state. Nothing when the
 * map doesn't change.
 */
export function switchMap(
	document: PlanDocument,
	{ stageId, variant }: { stageId: StageId; variant?: MapVariant },
): PlanOperation[] {
	const nextVariant =
		variant && variantsOfStage(stageId).includes(variant) ? variant : undefined;
	if (document.stageId === stageId && document.variant === nextVariant) {
		return [];
	}

	return [
		{ type: "updateBoard", patch: { stageId, variant: nextVariant } },
		...document.slots.flatMap((player, index): PlanOperation[] => {
			const slot = index as SlotIndex;
			if (!player) return [];

			return [
				{
					type: "updatePlayer",
					slot,
					patch: { position: teamSidePosition(slot) },
				},
			];
		}),
		...document.markers.map(
			(marker): PlanOperation => ({ type: "removeMarker", id: marker.id }),
		),
		...document.drawings.map(
			(drawing): PlanOperation => ({ type: "removeDrawing", id: drawing.id }),
		),
		...clearedInk(document),
		{
			type: "setObjective",
			objective: emptyObjective(document.objective.mode),
		},
	];
}

/** Switches the mode, which resets the objective's state and nothing else. Nothing when the mode is the same. */
export function switchMode(
	document: PlanDocument,
	mode: ModeShort,
): PlanOperation[] {
	if (document.objective.mode === mode) return [];

	return [{ type: "setObjective", objective: emptyObjective(mode) }];
}

/**
 * Gives the slot a player with `weaponId`, placed on its team's side of the map unless
 * `onMap: false` (e.g. while it is being dragged onto the map), or switches the weapon of the
 * player already there.
 * A switch keeps the token where it is and its label and status, but ends the special and
 * removes the thrown subs and placed special, which belonged to the old kit.
 */
export function setWeapon(
	document: PlanDocument,
	slot: SlotIndex,
	weaponId: MainWeaponId,
	{ onMap = true }: { onMap?: boolean } = {},
): PlanOperation[] {
	const player = document.slots[slot];
	if (!player) {
		return [
			{
				type: "setPlayer",
				slot,
				player: {
					...newPlayer(weaponId),
					position: onMap ? teamSidePosition(slot) : null,
				},
			},
		];
	}
	if (player.weaponId === weaponId) return [];

	return [
		...removedMarkersOf(document, slot),
		{
			type: "updatePlayer",
			slot,
			patch: { weaponId, specialActive: false },
		},
	];
}

/** Empties the slot, taking the token and everything it threw or placed off the map. */
export function emptySlot(
	document: PlanDocument,
	slot: SlotIndex,
): PlanOperation[] {
	if (!document.slots[slot]) return [];

	return [
		...removedMarkersOf(document, slot),
		{ type: "setPlayer", slot, player: null },
	];
}

/**
 * Puts the slot's token on the map: at `position` (clamped to the map) when given, otherwise
 * back where it was hidden or, if never placed, on its team's side of the map. Nothing for an
 * empty slot or a token already on the map without a new position.
 */
export function placePlayer(
	document: PlanDocument,
	slot: SlotIndex,
	position?: Point,
): PlanOperation[] {
	const player = document.slots[slot];
	if (!player) return [];

	if (position) {
		return [
			{
				type: "updatePlayer",
				slot,
				patch: { position: clampedToMap(position), hidden: false },
			},
		];
	}
	if (player.position && !player.hidden) return [];

	return [
		{
			type: "updatePlayer",
			slot,
			patch: {
				position: player.position ?? teamSidePosition(slot),
				hidden: false,
			},
		},
	];
}

/**
 * Puts the player in `status`. Any status but normal ends the special, the special's marker
 * staying where it was placed. Nothing when it already is.
 */
export function setStatus(
	document: PlanDocument,
	slot: SlotIndex,
	status: PlayerStatus,
): PlanOperation[] {
	const player = document.slots[slot];
	if (!player || player.status === status) return [];

	return [
		{
			type: "updatePlayer",
			slot,
			patch:
				status === "normal" ? { status } : { status, specialActive: false },
		},
	];
}

/**
 * Starts or ends the player's special. Starting it brings the player back to normal status and,
 * for a special placed away from the player (see `PlanKit.isPlacedSpecial`), drops its marker
 * next to the token. Ending it takes that marker off the map.
 */
export function toggleSpecial(
	document: PlanDocument,
	slot: SlotIndex,
): PlanOperation[] {
	const player = document.slots[slot];
	if (!player) return [];

	const specialMarkers = document.markers.filter(
		(marker) => marker.owner === slot && marker.kind === "special",
	);
	if (player.specialActive) {
		return [
			...specialMarkers.map(
				(marker): PlanOperation => ({ type: "removeMarker", id: marker.id }),
			),
			{ type: "updatePlayer", slot, patch: { specialActive: false } },
		];
	}

	const markerPosition = nextMarkerPosition(document, slot);
	const dropsMarker =
		PlanKit.isPlacedSpecial(PlanKit.specialOf(player.weaponId)) &&
		specialMarkers.length === 0 &&
		markerPosition;

	return [
		{
			type: "updatePlayer",
			slot,
			patch: { specialActive: true, status: "normal" },
		},
		...(dropsMarker
			? [newMarker({ kind: "special", owner: slot, position: markerPosition })]
			: []),
	];
}

/** Drops a marker of the player's sub next to the token. Nothing while the token is off the map. */
export function throwSub(
	document: PlanDocument,
	slot: SlotIndex,
): PlanOperation[] {
	const position = nextMarkerPosition(document, slot);
	if (!position) return [];

	return [newMarker({ kind: "sub", owner: slot, position })];
}

/**
 * Switches the player to the next kit of the same weapon (see `PlanKit.nextKit`), like
 * {@link setWeapon} ending the special and removing the old kit's markers.
 */
export function switchKit(
	document: PlanDocument,
	slot: SlotIndex,
): PlanOperation[] {
	const player = document.slots[slot];
	if (!player) return [];

	return setWeapon(document, slot, PlanKit.nextKit(player.weaponId));
}

/**
 * Takes the token off the map, the slot keeping everything else, or puts a token that is off
 * the map back on it (see {@link placePlayer}).
 */
export function toggleHidden(
	document: PlanDocument,
	slot: SlotIndex,
): PlanOperation[] {
	const player = document.slots[slot];
	if (!player) return [];
	if (!isOnMap(document, slot)) return placePlayer(document, slot);

	return [{ type: "updatePlayer", slot, patch: { hidden: true } }];
}

/** Moves a marker to `position`, clamped to the map. */
export function moveMarker(
	document: PlanDocument,
	id: string,
	position: Point,
): PlanOperation[] {
	if (!document.markers.some((marker) => marker.id === id)) return [];

	return [
		{ type: "updateMarker", id, patch: { position: clampedToMap(position) } },
	];
}

/**
 * Moves drawings by `delta` from where they were in `originals` (e.g. at the start of a drag),
 * the same delta for all so they keep their arrangement, shortened so that none of them leaves
 * the map.
 */
export function moveDrawings(
	originals: PlanDrawing[],
	delta: Point,
): PlanOperation[] {
	const [dx, dy] = PlanGeometry.deltaKeepingOnMap(
		originals.flatMap(PlanGeometry.anchorsOf),
		delta,
	);

	return originals.map((original): PlanOperation => {
		const moved = PlanGeometry.translated(original, [
			Math.round(dx),
			Math.round(dy),
		]);

		switch (moved.type) {
			case "stroke":
				return {
					type: "updateDrawing",
					id: moved.id,
					patch: { points: moved.points },
				};
			case "text":
				return {
					type: "updateDrawing",
					id: moved.id,
					patch: { position: moved.position },
				};
			default:
				return {
					type: "updateDrawing",
					id: moved.id,
					patch: { from: moved.from, to: moved.to },
				};
		}
	});
}

/** Removes the drawings of `ids` that exist. */
export function removeDrawings(
	document: PlanDocument,
	ids: string[],
): PlanOperation[] {
	return document.drawings
		.filter((drawing) => ids.includes(drawing.id))
		.map(
			(drawing): PlanOperation => ({ type: "removeDrawing", id: drawing.id }),
		);
}

/**
 * Brings the drawings of `ids` in front of every other drawing or sends them behind all of them,
 * keeping their order among themselves. Only drawings move this way: they stay under the radii,
 * markers and tokens. Nothing when they already are there.
 */
export function reorderDrawings(
	document: PlanDocument,
	ids: string[],
	place: "front" | "back",
): PlanOperation[] {
	const moved = document.drawings.filter((drawing) => ids.includes(drawing.id));
	const others = document.drawings.filter(
		(drawing) => !ids.includes(drawing.id),
	);
	const reordered =
		place === "front" ? [...others, ...moved] : [...moved, ...others];
	if (
		reordered.every((drawing, index) => drawing === document.drawings[index])
	) {
		return [];
	}

	return moved.flatMap((drawing, index): PlanOperation[] => [
		{ type: "removeDrawing", id: drawing.id },
		{
			type: "addDrawing",
			drawing,
			...(place === "back" ? { index } : {}),
		},
	]);
}

/** Gives the drawings of `ids` a colour or size, leaving out those already having it. */
export function styleDrawings(
	document: PlanDocument,
	ids: string[],
	style: { color?: string; size?: DrawingSize },
): PlanOperation[] {
	return document.drawings.flatMap((drawing): PlanOperation[] => {
		if (!ids.includes(drawing.id)) return [];

		const patch = {
			...(style.color && style.color !== drawing.color
				? { color: style.color }
				: {}),
			...(style.size && style.size !== drawing.size
				? { size: style.size }
				: {}),
		};
		if (Object.keys(patch).length === 0) return [];

		return [{ type: "updateDrawing", id: drawing.id, patch }];
	});
}

/** Sets the text of a text drawing, removing it when nothing but whitespace is left. */
export function setText(
	document: PlanDocument,
	id: string,
	text: string,
): PlanOperation[] {
	const drawing = drawingOf(document, id);
	if (drawing?.type !== "text") return [];
	if (text.trim() === "") return [{ type: "removeDrawing", id }];

	const nextText = text.slice(0, DRAWING_TEXT_MAX_LENGTH);
	if (nextText === drawing.text) return [];

	return [{ type: "updateDrawing", id, patch: { text: nextText } }];
}

/** Spans a rectangle or an ellipse over `box`, kept on the map. */
export function resizeShape(
	document: PlanDocument,
	id: string,
	box: PlanGeometry.Box,
): PlanOperation[] {
	const drawing = drawingOf(document, id);
	if (drawing?.type !== "rectangle" && drawing?.type !== "ellipse") return [];

	return [
		{
			type: "updateDrawing",
			id,
			patch: {
				from: clampedToMap([box.x, box.y]),
				to: clampedToMap([box.x + box.width, box.y + box.height]),
			},
		},
	];
}

/** Moves a text drawing's top left corner to `position` and resizes it by `scale`, within {@link TEXT_SCALE_LIMITS}. */
export function scaleText(
	document: PlanDocument,
	id: string,
	{ position, scale }: { position: Point; scale: number },
): PlanOperation[] {
	const drawing = drawingOf(document, id);
	if (drawing?.type !== "text") return [];

	return [
		{
			type: "updateDrawing",
			id,
			patch: {
				position: clampedToMap(position),
				scale: Math.min(
					Math.max(scale, TEXT_SCALE_LIMITS.min),
					TEXT_SCALE_LIMITS.max,
				),
			},
		},
	];
}

/** Whether the slot's token is on the map: placed and not hidden. */
export function isOnMap(document: PlanDocument, slot: SlotIndex) {
	const player = document.slots[slot];
	return Boolean(player?.position && !player.hidden);
}

/** Down the render's left edge for team A and right edge for team B, in slot order from the top. */
// XXX: with cutouts the render's edges are the map itself, revisit where unplaced tokens go in the cutouts step
function teamSidePosition(slot: SlotIndex): Point {
	const indexInTeam = slot % SLOTS_PER_TEAM;

	return [
		teamOfSlot(slot) === 0 ? TEAM_SIDE_INSET : MAP_SIZE.width - TEAM_SIDE_INSET,
		Math.round(
			MAP_SIZE.height / 2 +
				(indexInTeam - (SLOTS_PER_TEAM - 1) / 2) * PLACED_TOKEN_SPACING,
		),
	];
}

function clampedToMap([x, y]: Point): Point {
	return [
		Math.round(Math.min(Math.max(x, 0), MAP_SIZE.width)),
		Math.round(Math.min(Math.max(y, 0), MAP_SIZE.height)),
	];
}

function removedMarkersOf(
	document: PlanDocument,
	slot: SlotIndex,
): PlanOperation[] {
	return document.markers
		.filter((marker) => marker.owner === slot)
		.map((marker): PlanOperation => ({ type: "removeMarker", id: marker.id }));
}

function clearedInk(document: PlanDocument): PlanOperation[] {
	const cells: Array<[number, 0]> = [];
	for (const [index, cell] of document.ink.entries()) {
		if (cell !== 0) cells.push([index, 0]);
	}

	return cells.length > 0 ? [{ type: "setInk", cells }] : [];
}

/**
 * Around the token, starting towards the enemy's side and turning a step further for every
 * marker the player already has. `null` while the token is off the map.
 */
function nextMarkerPosition(
	document: PlanDocument,
	slot: SlotIndex,
): Point | null {
	const position = document.slots[slot]?.position;
	if (!position || !isOnMap(document, slot)) return null;

	const markerCount = document.markers.filter(
		(marker) => marker.owner === slot,
	).length;
	const towardsEnemy = teamOfSlot(slot) === 0 ? 0 : Math.PI;
	const angle = towardsEnemy + markerCount * MARKER_ANGLE_STEP;

	return clampedToMap([
		position[0] + Math.cos(angle) * MARKER_DISTANCE,
		position[1] + Math.sin(angle) * MARKER_DISTANCE,
	]);
}

function drawingOf(document: PlanDocument, id: string) {
	return document.drawings.find((drawing) => drawing.id === id);
}

function newMarker(marker: Omit<PlanMarker, "id">): PlanOperation {
	return { type: "addMarker", marker: { id: newId(), ...marker } };
}
