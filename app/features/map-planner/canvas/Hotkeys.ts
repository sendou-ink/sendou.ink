// Listens to the page's key presses and runs the planner's hotkeys (see
// `PlanHotkeys`), leaving alone the ones meant for a focused field, menu,
// popover or dialog. Plain DOM, no React.

import * as PlanHotkeys from "../core/PlanHotkeys";
import type { PlanSelection } from "../core/PlanSelection";

/** Calls `onCommand` with the command of every hotkey pressed, returns the function stopping it. */
export function listen({
	selection,
	onCommand,
}: {
	selection: PlanSelection;
	onCommand: (command: PlanHotkeys.HotkeyCommand) => void;
}) {
	const onKeyDown = (event: KeyboardEvent) => {
		if (event.defaultPrevented || isForFocusedElement(event)) return;

		const command = PlanHotkeys.match(event, selection.get());
		if (!command) return;

		event.preventDefault();
		onCommand(command);
	};

	window.addEventListener("keydown", onKeyDown);
	return () => window.removeEventListener("keydown", onKeyDown);
}

/**
 * Whether the key press belongs to what has focus: typing in a field or a label, keys in a
 * menu, popover or dialog, and Enter or Space pressing a focused button or link.
 */
export function isForFocusedElement(event: KeyboardEvent) {
	const target = event.target;
	if (!(target instanceof HTMLElement)) return false;
	if (
		target.isContentEditable ||
		target.closest("input, textarea, select, [popover], dialog") !== null
	) {
		return true;
	}

	return (
		(event.key === "Enter" || event.key === " ") &&
		target.closest("button, a") !== null
	);
}

/** Whether the page runs on an Apple device, whose shortcuts use ⌘ for Ctrl. */
export function isMac() {
	return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}
