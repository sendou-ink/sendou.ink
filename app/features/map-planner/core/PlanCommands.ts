// User actions that edit more than one object, expressed as the operations
// they apply. Applied together through the editor they are one undo step.

import { stagesObj } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import {
	emptyObjective,
	type MapVariant,
	type PlanDocument,
	type SlotIndex,
} from "./PlanDocument";
import type { PlanOperation } from "./PlanOperation";

/** The layout variants a stage has besides its standard one. */
export function variantsOfStage(stageId: StageId): MapVariant[] {
	return stageId === stagesObj.MAHI_MAHI_RESORT ? ["lowTide"] : [];
}

/**
 * Moves the plan to another map, or another layout of the same stage. The players stay in their
 * slots but go off the map, and everything drawn on the old map goes: markers, drawings, ink and
 * the objective's state. Nothing when the map doesn't change.
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
		...document.slots.flatMap((player, slot): PlanOperation[] =>
			player?.position || player?.hidden
				? [
						{
							type: "updatePlayer",
							slot: slot as SlotIndex,
							patch: { position: null, hidden: false },
						},
					]
				: [],
		),
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

function clearedInk(document: PlanDocument): PlanOperation[] {
	const cells: Array<[number, 0]> = [];
	for (const [index, cell] of document.ink.entries()) {
		if (cell !== 0) cells.push([index, 0]);
	}

	return cells.length > 0 ? [{ type: "setInk", cells }] : [];
}
