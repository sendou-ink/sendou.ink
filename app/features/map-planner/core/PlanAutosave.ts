// Keeps a saved copy of the plan being edited, written a moment after the
// last change so a drag or a brush stroke isn't saved a hundred times.
// Where it is saved to is up to the host (the browser's storage today).

import type { PlanDocument } from "./PlanDocument";
import type { PlanEditor } from "./PlanEditor";

/** How long after the last change the plan is saved. */
const SAVE_DELAY_MS = 500;

/** See {@link start}. */
export interface PlanAutosave {
	/** Saves a change not saved yet right away, e.g. when the page is being left. */
	flush: () => void;
	/** Saves what is pending and stops following the editor. */
	stop: () => void;
}

/** Calls `save` with the editor's plan {@link SAVE_DELAY_MS} after each change, the last change of a burst only. */
export function start({
	editor,
	save,
}: {
	editor: PlanEditor;
	save: (document: PlanDocument) => void;
}): PlanAutosave {
	let pending: ReturnType<typeof setTimeout> | null = null;

	const flush = () => {
		if (pending === null) return;

		clearTimeout(pending);
		pending = null;
		save(editor.getDocument());
	};

	const unsubscribe = editor.subscribe(() => {
		if (pending !== null) clearTimeout(pending);
		pending = setTimeout(flush, SAVE_DELAY_MS);
	});

	return {
		flush,
		stop: () => {
			unsubscribe();
			flush();
		},
	};
}
