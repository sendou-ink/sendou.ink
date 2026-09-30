import * as React from "react";
import { afterEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { lockScroll } from "~/modules/scroll-lock/scroll-lock";
import { invariant } from "~/utils/invariant";
import { closeKeyboard, KEYBOARD_HEIGHT, openKeyboard } from "./tests/keyboard";
import { useScrollIntoView } from "./useScrollIntoView";

const PAGE_HEIGHT = 5000;
const ANCHOR_HEIGHT = 40;

afterEach(() => {
	closeKeyboard();
	window.scrollTo(0, 0);
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

function Anchored({ top }: { top: number }) {
	const ref = React.useRef<HTMLDivElement>(null);
	useScrollIntoView(true, () => ref.current);

	return (
		<>
			<div style={{ height: PAGE_HEIGHT }} />
			<div
				ref={ref}
				data-testid="anchor"
				style={{
					position: "absolute",
					top,
					left: 0,
					width: 100,
					height: ANCHOR_HEIGHT,
				}}
			/>
		</>
	);
}

function anchorRect() {
	const anchor = document.querySelector('[data-testid="anchor"]');
	invariant(anchor);
	return anchor.getBoundingClientRect();
}

function visualViewportHeight() {
	const viewport = window.visualViewport;
	invariant(viewport);
	return viewport.height;
}

describe("useScrollIntoView", () => {
	test("scrolls the page so the anchor sits above the keyboard opening over it", async () => {
		const top = visualViewportHeight() - KEYBOARD_HEIGHT + 20;
		await render(<Anchored top={top} />);

		openKeyboard();

		await expect
			.poll(() => anchorRect().bottom)
			.toBeLessThanOrEqual(visualViewportHeight());
		expect(window.scrollY).toBeGreaterThan(0);
	});

	test("leaves the page alone when the anchor is above the keyboard already", async () => {
		await render(<Anchored top={100} />);

		openKeyboard();
		await settle();

		expect(window.scrollY).toBe(0);
	});

	test("leaves the page alone when the viewport did not shrink to a keyboard", async () => {
		const top = visualViewportHeight() - KEYBOARD_HEIGHT + 20;
		await render(<Anchored top={top} />);

		window.visualViewport?.dispatchEvent(new Event("resize"));
		await settle();

		expect(window.scrollY).toBe(0);
	});

	test("does not scroll a scroll locked page", async () => {
		const top = visualViewportHeight() - KEYBOARD_HEIGHT + 20;
		await render(<Anchored top={top} />);
		const release = lockScroll();

		try {
			openKeyboard();
			await settle();

			expect(window.scrollY).toBe(0);
		} finally {
			release();
		}
	});
});
