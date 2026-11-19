// Every edit of a plan is one of these operations on one object, plain data so
// that it can be stored, sent over the wire for multiplayer later and inverted
// for undo. `apply` is the only way a plan changes.

import * as R from "remeda";
import type {
	InkCell,
	PlanDocument,
	PlanDrawing,
	PlanMarker,
	PlanObjective,
	PlanPlayer,
	PlanTeam,
	SlotIndex,
	TeamIndex,
} from "./PlanDocument";

/** The map a plan is on, `variant: undefined` going back to the standard layout. The mode is part of {@link PlanObjective}. */
export type BoardPatch = Partial<Pick<PlanDocument, "stageId" | "variant">>;

/** Properties of the current mode's objective, `mode` naming which one it is meant for. */
export type ObjectivePatch = {
	[Mode in PlanObjective["mode"]]: { mode: Mode } & Partial<
		Omit<Extract<PlanObjective, { mode: Mode }>, "mode">
	>;
}[PlanObjective["mode"]];

/** Properties of one kind of drawing, its `id` and `type` fixed. */
export type DrawingPatch = {
	[Type in PlanDrawing["type"]]: Partial<
		Omit<Extract<PlanDrawing, { type: Type }>, "id" | "type">
	>;
}[PlanDrawing["type"]];

/** One edit of one object of a plan. */
export type PlanOperation =
	| { type: "updateBoard"; patch: BoardPatch }
	| { type: "updateTeam"; team: TeamIndex; patch: Partial<PlanTeam> }
	/** Fills, replaces or (with `null`) empties a slot. */
	| { type: "setPlayer"; slot: SlotIndex; player: PlanPlayer | null }
	| { type: "updatePlayer"; slot: SlotIndex; patch: Partial<PlanPlayer> }
	/** `index` puts it back where it was when undoing a removal, otherwise it goes on top. */
	| { type: "addMarker"; marker: PlanMarker; index?: number }
	| { type: "removeMarker"; id: string }
	| {
			type: "updateMarker";
			id: string;
			patch: Partial<Omit<PlanMarker, "id">>;
	  }
	| { type: "addDrawing"; drawing: PlanDrawing; index?: number }
	| { type: "removeDrawing"; id: string }
	| { type: "updateDrawing"; id: string; patch: DrawingPatch }
	/** `[cell index, value]` pairs, see {@link PlanDocument.ink}. */
	| { type: "setInk"; cells: Array<[index: number, value: InkCell]> }
	/** Switches the mode, or resets its objective with the same mode. */
	| { type: "setObjective"; objective: PlanObjective }
	/** Changes nothing when the plan is on another mode by now. */
	| { type: "updateObjective"; patch: ObjectivePatch };

/** See {@link targetOf}. */
type OperationTarget =
	| "board"
	| "ink"
	| "objective"
	| `team:${TeamIndex}`
	| `player:${SlotIndex}`
	| `marker:${string}`
	| `drawing:${string}`;

/**
 * Applies an operation to a plan without mutating it. Returns the new plan and the operation
 * undoing it, computed against the plan it was applied to. An operation on something that
 * doesn't exist (an update of a removed drawing, a marker added twice) changes nothing and
 * has no inverse, so operations arriving late or twice are harmless.
 */
export function apply(
	document: PlanDocument,
	operation: PlanOperation,
): { document: PlanDocument; inverse: PlanOperation | null } {
	switch (operation.type) {
		case "updateBoard": {
			return {
				document: { ...document, ...operation.patch },
				inverse: {
					type: "updateBoard",
					patch: previousValues(document, operation.patch),
				},
			};
		}
		case "updateTeam": {
			const team = document.teams[operation.team];
			const teams = [...document.teams] as PlanDocument["teams"];
			teams[operation.team] = { ...team, ...operation.patch };

			return {
				document: { ...document, teams },
				inverse: {
					type: "updateTeam",
					team: operation.team,
					patch: previousValues(team, operation.patch),
				},
			};
		}
		case "setPlayer": {
			return {
				document: withSlot(document, operation.slot, operation.player),
				inverse: {
					type: "setPlayer",
					slot: operation.slot,
					player: document.slots[operation.slot] ?? null,
				},
			};
		}
		case "updatePlayer": {
			const player = document.slots[operation.slot];
			if (!player) return unchanged(document);

			return {
				document: withSlot(document, operation.slot, {
					...player,
					...operation.patch,
				}),
				inverse: {
					type: "updatePlayer",
					slot: operation.slot,
					patch: previousValues(player, operation.patch),
				},
			};
		}
		case "addMarker": {
			const markers = withAdded(
				document.markers,
				operation.marker,
				operation.index,
			);
			if (!markers) return unchanged(document);

			return {
				document: { ...document, markers },
				inverse: { type: "removeMarker", id: operation.marker.id },
			};
		}
		case "removeMarker": {
			const index = document.markers.findIndex(
				(marker) => marker.id === operation.id,
			);
			if (index === -1) return unchanged(document);

			return {
				document: {
					...document,
					markers: document.markers.toSpliced(index, 1),
				},
				inverse: {
					type: "addMarker",
					marker: document.markers[index],
					index,
				},
			};
		}
		case "updateMarker": {
			const index = document.markers.findIndex(
				(marker) => marker.id === operation.id,
			);
			if (index === -1) return unchanged(document);
			const updated = document.markers[index];

			return {
				document: {
					...document,
					markers: document.markers.with(index, {
						...updated,
						...operation.patch,
					}),
				},
				inverse: {
					type: "updateMarker",
					id: operation.id,
					patch: previousValues(updated, operation.patch),
				},
			};
		}
		case "addDrawing": {
			const drawings = withAdded(
				document.drawings,
				operation.drawing,
				operation.index,
			);
			if (!drawings) return unchanged(document);

			return {
				document: { ...document, drawings },
				inverse: { type: "removeDrawing", id: operation.drawing.id },
			};
		}
		case "removeDrawing": {
			const index = document.drawings.findIndex(
				(drawing) => drawing.id === operation.id,
			);
			if (index === -1) return unchanged(document);

			return {
				document: {
					...document,
					drawings: document.drawings.toSpliced(index, 1),
				},
				inverse: {
					type: "addDrawing",
					drawing: document.drawings[index],
					index,
				},
			};
		}
		case "updateDrawing": {
			const index = document.drawings.findIndex(
				(drawing) => drawing.id === operation.id,
			);
			if (index === -1) return unchanged(document);
			const updated = document.drawings[index];

			return {
				document: {
					...document,
					drawings: document.drawings.with(index, {
						...updated,
						...operation.patch,
					} as PlanDrawing),
				},
				inverse: {
					type: "updateDrawing",
					id: operation.id,
					patch: previousValues(
						updated,
						operation.patch as Partial<PlanDrawing>,
					) as DrawingPatch,
				},
			};
		}
		case "setInk": {
			const cells = operation.cells.filter(
				([index]) =>
					Number.isInteger(index) && index >= 0 && index < document.ink.length,
			);
			if (cells.length === 0) return unchanged(document);

			const ink = [...document.ink];
			const previous: Array<[number, InkCell]> = [];
			for (const [index, value] of cells) {
				previous.push([index, ink[index]]);
				ink[index] = value;
			}

			return {
				document: { ...document, ink },
				inverse: { type: "setInk", cells: previous.reverse() },
			};
		}
		case "setObjective": {
			return {
				document: { ...document, objective: operation.objective },
				inverse: { type: "setObjective", objective: document.objective },
			};
		}
		case "updateObjective": {
			if (operation.patch.mode !== document.objective.mode) {
				return unchanged(document);
			}

			return {
				document: {
					...document,
					objective: {
						...document.objective,
						...operation.patch,
					} as PlanObjective,
				},
				inverse: {
					type: "updateObjective",
					patch: previousValues(
						document.objective,
						operation.patch as Partial<PlanObjective>,
					) as ObjectivePatch,
				},
			};
		}
	}
}

/**
 * Key telling which object an operation is about, the same for every operation on that
 * object (adding, updating and removing a drawing share one). The whole ink grid counts as
 * one object.
 */
export function targetOf(operation: PlanOperation): OperationTarget {
	switch (operation.type) {
		case "updateBoard":
			return "board";
		case "updateTeam":
			return `team:${operation.team}`;
		case "setPlayer":
		case "updatePlayer":
			return `player:${operation.slot}`;
		case "addMarker":
			return `marker:${operation.marker.id}`;
		case "removeMarker":
		case "updateMarker":
			return `marker:${operation.id}`;
		case "addDrawing":
			return `drawing:${operation.drawing.id}`;
		case "removeDrawing":
		case "updateDrawing":
			return `drawing:${operation.id}`;
		case "setInk":
			return "ink";
		case "setObjective":
		case "updateObjective":
			return "objective";
	}
}

function unchanged(document: PlanDocument) {
	return { document, inverse: null };
}

function previousValues<T extends object>(current: T, patch: Partial<T>) {
	const result: Partial<T> = {};
	for (const key of Object.keys(patch) as Array<keyof T>) {
		result[key] = current[key];
	}
	return result;
}

function withSlot(
	document: PlanDocument,
	slot: SlotIndex,
	player: PlanPlayer | null,
): PlanDocument {
	return { ...document, slots: document.slots.with(slot, player) };
}

function withAdded<T extends { id: string }>(
	items: T[],
	item: T,
	index: number | undefined,
) {
	if (items.some((existing) => existing.id === item.id)) return null;

	return items.toSpliced(
		R.clamp(index ?? items.length, { min: 0, max: items.length }),
		0,
		item,
	);
}
