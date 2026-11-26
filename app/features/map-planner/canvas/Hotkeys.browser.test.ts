import { afterEach, describe, expect, test, vi } from "vitest";
import * as PlanSelection from "../core/PlanSelection";
import * as Hotkeys from "./Hotkeys";

const cleanups: Array<() => void> = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

/** Listens to hotkeys with a drawing selected, so Enter and Backspace have commands too. */
function setUp() {
	const selection = PlanSelection.create();
	selection.set({ type: "drawings", ids: ["label"] });
	const onCommand = vi.fn();
	cleanups.push(Hotkeys.listen({ selection, onCommand }));

	return onCommand;
}

/** An element on the page, inside a wrapper made by `wrap` when given. */
function element(tag: string, wrap?: (child: HTMLElement) => HTMLElement) {
	const child = document.createElement(tag);
	const root = wrap ? wrap(child) : child;
	document.body.append(root);
	cleanups.push(() => root.remove());
	return child;
}

function inside(tag: string, attributes: Record<string, string> = {}) {
	return (child: HTMLElement) => {
		const parent = document.createElement(tag);
		for (const [name, value] of Object.entries(attributes)) {
			parent.setAttribute(name, value);
		}
		parent.append(child);
		return parent;
	};
}

function press(target: HTMLElement, key: string) {
	target.dispatchEvent(
		new KeyboardEvent("keydown", {
			key,
			code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
			bubbles: true,
			cancelable: true,
		}),
	);
}

describe("Hotkeys.listen", () => {
	test.each([
		{ why: "a map label's text field", target: () => element("textarea") },
		{ why: "an input", target: () => element("input") },
		{
			why: "a contenteditable element",
			target: () => {
				const editable = element("div");
				editable.contentEditable = "true";
				return editable;
			},
		},
		{
			why: "a menu or picker popover",
			target: () => element("button", inside("div", { popover: "auto" })),
		},
		{
			why: "a dialog",
			target: () => element("button", inside("dialog")),
		},
	])("leaves keys typed in $why alone", ({ target }) => {
		const onCommand = setUp();
		const focused = target();

		for (const key of ["t", "d", "Backspace", "Enter"]) press(focused, key);

		expect(onCommand).not.toHaveBeenCalled();
	});

	test.each([
		{ why: "a button", tag: "button" },
		{ why: "a link", tag: "a" },
	])("leaves Enter on a focused $why to it", ({ tag }) => {
		const onCommand = setUp();

		press(element(tag), "Enter");

		expect(onCommand).not.toHaveBeenCalled();
	});

	test("runs letters pressed on a focused button", () => {
		const onCommand = setUp();

		press(element("button"), "p");

		expect(onCommand).toHaveBeenCalledWith({ type: "tool", tool: "pen" });
	});

	test("runs keys pressed with nothing focused", () => {
		const onCommand = setUp();

		press(document.body, "Backspace");

		expect(onCommand).toHaveBeenCalledWith({ type: "deleteDrawings" });
	});
});
