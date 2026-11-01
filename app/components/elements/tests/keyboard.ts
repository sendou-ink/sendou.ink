import { invariant } from "~/utils/invariant";

export const KEYBOARD_HEIGHT = 300;

const KEYBOARD_INPUT_ID = "test-keyboard-input";

/** Fakes the mobile keyboard opening by shrinking the visual viewport, focusing a text input first unless one already is (the keyboard only opens for one). */
export function openKeyboard() {
	const viewport = window.visualViewport;
	invariant(viewport);

	if (!(document.activeElement instanceof HTMLInputElement)) {
		const input = document.createElement("input");
		input.id = KEYBOARD_INPUT_ID;
		input.style.position = "fixed";
		input.style.top = "0";
		document.body.append(input);
		input.focus({ preventScroll: true });
	}

	shrinkViewport();
	viewport.dispatchEvent(new Event("resize"));
}

/** Shrinks the visual viewport by the keyboard's height without focusing anything or firing a resize event. */
export function shrinkViewport() {
	const viewport = window.visualViewport;
	invariant(viewport);

	const shrunk = viewport.height - KEYBOARD_HEIGHT;
	Object.defineProperty(viewport, "height", {
		configurable: true,
		get: () => shrunk,
	});
}

export function closeKeyboard() {
	const viewport = window.visualViewport;
	invariant(viewport);

	document.getElementById(KEYBOARD_INPUT_ID)?.remove();
	Reflect.deleteProperty(viewport, "height");
	viewport.dispatchEvent(new Event("resize"));
}
