// User actions that edit more than one object, expressed as the operations
// they apply. Applied together through the editor they are one undo step.

import { stagesObj } from "~/modules/in-game-lists/stage-ids";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import {
	emptyObjective,
	MAP_SIZE,
	type MapVariant,
	newPlayer,
	type PlanDocument,
	type Point,
	SLOTS_PER_TEAM,
	type SlotIndex,
	teamOfSlot,
} from "./PlanDocument";
import type { PlanOperation } from "./PlanOperation";

/** Distance from the render's left (team A) or right (team B) edge of tokens placed without a position. */
const TEAM_SIDE_INSET = 80;
/** Vertical distance between the tokens of one team placed without a position. */
const PLACED_TOKEN_SPACING = 140;

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
