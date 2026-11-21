// What the user has selected. View state of one user, not part of the plan:
// shared by the canvas and the chrome, framework-free like the editor.

import type { SlotIndex } from "./PlanDocument";

/** The selected player or drawings, `null` for nothing. A selection never mixes the two. */
export type Selection =
	| { type: "player"; slot: SlotIndex }
	| { type: "drawings"; ids: string[] }
	| null;

/** See {@link create}. */
export interface PlanSelection {
	get: () => Selection;
	set: (selection: Selection) => void;
	/** Calls `listener` after every change, returns the unsubscribe function. */
	subscribe: (listener: () => void) => () => void;
}

/** A selection with nothing selected. */
export function create(): PlanSelection {
	let selection: Selection = null;
	const listeners = new Set<() => void>();

	return {
		get: () => selection,
		set: (next) => {
			const normalized =
				next?.type === "drawings" && next.ids.length === 0 ? null : next;
			if (isSame(selection, normalized)) return;

			selection = normalized;
			for (const listener of listeners) listener();
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

/** The slot whose player is selected, if a player is. */
export function selectedSlot(selection: Selection) {
	return selection?.type === "player" ? selection.slot : null;
}

/** Ids of the selected drawings, none when a player or nothing is selected. */
export function selectedDrawingIds(selection: Selection): string[] {
	return selection?.type === "drawings" ? selection.ids : [];
}

function isSame(a: Selection, b: Selection) {
	if (a === null || b === null) return a === b;
	if (a.type === "player" || b.type === "player") {
		return selectedSlot(a) === selectedSlot(b);
	}

	return (
		a.ids.length === b.ids.length && a.ids.every((id) => b.ids.includes(id))
	);
}
