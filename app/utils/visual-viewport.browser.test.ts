import { afterEach, describe, expect, test } from "vitest";
import {
	closeKeyboard,
	openKeyboard,
	shrinkViewport,
} from "~/components/elements/tests/keyboard";
import { focusWithoutPanning, keyboardIsOpen } from "./visual-viewport";

const FOCUSED_ELEMENT_ID = "test-focused-element";

afterEach(() => {
	document.getElementById(FOCUSED_ELEMENT_ID)?.remove();
	closeKeyboard();
});

describe("keyboardIsOpen", () => {
	test("is true when the viewport shrinks with a text input focused", () => {
		openKeyboard();

		expect(keyboardIsOpen()).toBe(true);
	});

	test("ignores a shrunk viewport when nothing is focused", () => {
		shrinkViewport();

		expect(keyboardIsOpen()).toBe(false);
	});

	test.each([
		{ why: "textarea", html: "<textarea></textarea>", expected: true },
		{
			why: "contenteditable",
			html: "<div contenteditable></div>",
			expected: true,
		},
		{ why: "search input", html: '<input type="search">', expected: true },
		{ why: "readonly input", html: "<input readonly>", expected: false },
		{
			why: 'inputmode="none"',
			html: '<input inputmode="none">',
			expected: false,
		},
		{ why: "checkbox", html: '<input type="checkbox">', expected: false },
		{
			why: 'contenteditable="false"',
			html: '<div contenteditable="false" tabindex="0"></div>',
			expected: false,
		},
	])(
		"is $expected with a shrunk viewport and a focused $why",
		({ html, expected }) => {
			focusElement(html);
			shrinkViewport();

			expect(keyboardIsOpen()).toBe(expected);
		},
	);
});

describe("focusWithoutPanning", () => {
	test("focuses a tapped text field itself, so the browser does not scroll to it", () => {
		const input = addElement("<input>");

		const event = touchEnd(input);

		expect(event.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(input);
	});

	test.each([
		{ why: "an already focused text field", html: "<input>", focused: true },
		{ why: "a checkbox", html: '<input type="checkbox">', focused: false },
		{ why: "a button", html: "<button>Send</button>", focused: false },
	])("leaves a tap on $why to the browser", ({ html, focused }) => {
		const element = addElement(html);
		if (focused) element.focus();

		expect(touchEnd(element).defaultPrevented).toBe(false);
	});
});

function addElement(html: string) {
	const template = document.createElement("template");
	template.innerHTML = html;
	const element = template.content.firstElementChild;
	if (!(element instanceof HTMLElement)) {
		throw new Error(`Not an HTML element: ${html}`);
	}

	element.id = FOCUSED_ELEMENT_ID;
	document.body.append(element);
	return element;
}

function touchEnd(element: HTMLElement) {
	const event = new Event("touchend", { bubbles: true, cancelable: true });
	element.addEventListener("touchend", focusWithoutPanning, { once: true });
	element.dispatchEvent(event);
	return event;
}

function focusElement(html: string) {
	const element = addElement(html);
	element.focus({ preventScroll: true });
	expect(document.activeElement).toBe(element);
}
