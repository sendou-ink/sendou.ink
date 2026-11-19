// The live plan being edited: applies operations, keeps the undo and redo
// history and tells subscribers (the canvas, the chrome) about every change.
// Framework-free, the UI subscribes to it.

import type { PlanDocument } from "./PlanDocument";
import * as PlanOperation from "./PlanOperation";

/**
 * Undo steps kept, the oldest dropped first.
 * @internal
 */
export const HISTORY_LIMIT = 200;

/** What subscribers of an editor are told after every change. */
export interface PlanChange {
	document: PlanDocument;
	previous: PlanDocument;
	/** What was applied, undo and redo included, in order. What multiplayer would send. */
	operations: PlanOperation.PlanOperation[];
}

/** See {@link create}. */
export interface PlanEditor {
	getDocument: () => PlanDocument;
	/** Calls `listener` after every change, history included, returns the unsubscribe function. */
	subscribe: (listener: (change: PlanChange) => void) => () => void;
	/** Applies the operations in order as one undo step, or as part of the open group. */
	apply: (
		operations: PlanOperation.PlanOperation | PlanOperation.PlanOperation[],
	) => void;
	/**
	 * Starts collecting everything applied until the matching {@link PlanEditor.endGroup} into
	 * one undo step, e.g. for a drag or a brush stroke. Groups nest, the outermost one counts.
	 */
	beginGroup: () => void;
	endGroup: () => void;
	undo: () => void;
	redo: () => void;
	canUndo: () => boolean;
	canRedo: () => boolean;
}

/** One undo step: the inverse operations in the order they were recorded, undone last first. */
type HistoryStep = PlanOperation.PlanOperation[];

/** An editor starting from `initial` with an empty history. */
export function create(initial: PlanDocument): PlanEditor {
	let document = initial;
	const undoStack: HistoryStep[] = [];
	const redoStack: HistoryStep[] = [];
	let groupDepth = 0;
	let openGroup: HistoryStep = [];
	const listeners = new Set<(change: PlanChange) => void>();

	const run = (operations: PlanOperation.PlanOperation[]) => {
		const previous = document;
		const inverses: HistoryStep = [];
		const applied: PlanOperation.PlanOperation[] = [];

		for (const operation of operations) {
			const result = PlanOperation.apply(document, operation);
			if (!result.inverse) continue;

			document = result.document;
			inverses.push(result.inverse);
			applied.push(operation);
		}

		return { inverses, notify: () => notifyListeners(previous, applied) };
	};

	const notifyListeners = (
		previous: PlanDocument,
		operations: PlanOperation.PlanOperation[],
	) => {
		if (operations.length === 0) return;

		for (const listener of listeners) {
			listener({ document, previous, operations });
		}
	};

	const pushUndoStep = (step: HistoryStep) => {
		if (step.length === 0) return;

		undoStack.push(step);
		if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
	};

	const closeGroup = () => {
		groupDepth = 0;
		pushUndoStep(openGroup);
		openGroup = [];
	};

	const travel = (from: HistoryStep[], to: HistoryStep[]) => {
		if (groupDepth > 0) closeGroup();

		const step = from.pop();
		if (!step) return;

		const { inverses, notify } = run(step.toReversed());
		if (inverses.length > 0) to.push(inverses);
		notify();
	};

	return {
		getDocument: () => document,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		apply: (operations) => {
			const { inverses, notify } = run(
				Array.isArray(operations) ? operations : [operations],
			);
			if (inverses.length === 0) return;

			redoStack.length = 0;
			if (groupDepth > 0) {
				for (const inverse of inverses) {
					openGroup = withRecorded(openGroup, inverse);
				}
			} else {
				pushUndoStep(inverses.reduce(withRecorded, []));
			}
			notify();
		},
		beginGroup: () => {
			groupDepth++;
		},
		endGroup: () => {
			if (groupDepth === 0) return;

			groupDepth--;
			if (groupDepth === 0) closeGroup();
		},
		undo: () => travel(undoStack, redoStack),
		redo: () => travel(redoStack, undoStack),
		canUndo: () => undoStack.length > 0 || openGroup.length > 0,
		canRedo: () => redoStack.length > 0,
	};
}

/**
 * Adds an inverse to a step, folding it into the step's last inverse of the same object when
 * both are updates: a drag of hundreds of moves undoes with one patch holding the values from
 * before it started. Inverses in between are of other objects, so the fold doesn't reorder
 * anything that matters.
 */
function withRecorded(
	step: HistoryStep,
	inverse: PlanOperation.PlanOperation,
): HistoryStep {
	const target = PlanOperation.targetOf(inverse);
	const earlierIndex = step.findLastIndex(
		(recorded) => PlanOperation.targetOf(recorded) === target,
	);
	if (earlierIndex === -1) return [...step, inverse];

	const folded = fold(step[earlierIndex], inverse);
	if (!folded) return [...step, inverse];

	return step.with(earlierIndex, folded);
}

/** One operation doing what applying `later` and then `earlier` does, if they can be folded. */
function fold(
	earlier: PlanOperation.PlanOperation,
	later: PlanOperation.PlanOperation,
): PlanOperation.PlanOperation | null {
	if (earlier.type === "setInk" && later.type === "setInk") {
		const cells = new Map(later.cells);
		for (const [index, value] of earlier.cells) {
			cells.set(index, value);
		}
		return { type: "setInk", cells: [...cells] };
	}

	if (
		earlier.type !== later.type ||
		!("patch" in earlier) ||
		!("patch" in later)
	) {
		return null;
	}

	return {
		...earlier,
		patch: { ...later.patch, ...earlier.patch },
	} as PlanOperation.PlanOperation;
}
