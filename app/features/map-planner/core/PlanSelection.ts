// What the user has selected. View state of one user, not part of the plan:
// shared by the canvas and the chrome, framework-free like the editor.

import type { SlotIndex } from "./PlanDocument";

/** The selected object, `null` for nothing. */
export type Selection = { type: "player"; slot: SlotIndex } | null;

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
			if (isSame(selection, next)) return;

			selection = next;
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

function isSame(a: Selection, b: Selection) {
	return selectedSlot(a) === selectedSlot(b);
}
