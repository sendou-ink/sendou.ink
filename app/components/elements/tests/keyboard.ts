import { invariant } from "~/utils/invariant";

export const KEYBOARD_HEIGHT = 300;

export function openKeyboard() {
	const viewport = window.visualViewport;
	invariant(viewport);

	const shrunk = viewport.height - KEYBOARD_HEIGHT;
	Object.defineProperty(viewport, "height", {
		configurable: true,
		get: () => shrunk,
	});
	viewport.dispatchEvent(new Event("resize"));
}

export function closeKeyboard() {
	const viewport = window.visualViewport;
	invariant(viewport);

	Reflect.deleteProperty(viewport, "height");
	viewport.dispatchEvent(new Event("resize"));
}
