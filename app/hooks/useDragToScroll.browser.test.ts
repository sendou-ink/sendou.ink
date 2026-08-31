import { afterEach, describe, expect, test, vi } from "vitest";
import { dragToScroll } from "./useDragToScroll";

let cleanupFns: Array<() => void> = [];

afterEach(() => {
	for (const cleanup of cleanupFns) {
		cleanup();
	}
	cleanupFns = [];
});

function setUpScrollableElement({ scrollSnap = false } = {}) {
	const element = document.createElement("div");
	element.style.width = "100px";
	element.style.height = "100px";
	element.style.overflow = "scroll";

	if (scrollSnap) {
		const snapStyle = document.createElement("style");
		snapStyle.textContent =
			".test-scroll-snap { scroll-snap-type: x mandatory; }";
		document.head.appendChild(snapStyle);
		element.classList.add("test-scroll-snap");
		cleanupFns.push(() => snapStyle.remove());
	}

	const child = document.createElement("div");
	child.style.width = "1000px";
	child.style.height = "1000px";
	element.appendChild(child);

	document.body.appendChild(element);

	const detach = dragToScroll(element);
	cleanupFns.push(() => {
		detach();
		element.remove();
	});

	return { element, child, detach };
}

function mouseDownOn(element: HTMLElement, clientX: number, clientY: number) {
	element.dispatchEvent(
		new MouseEvent("mousedown", { buttons: 1, clientX, clientY }),
	);
}

function mouseMoveTo(clientX: number, clientY: number) {
	window.dispatchEvent(
		new MouseEvent("mousemove", { buttons: 1, clientX, clientY }),
	);
}

function mouseUp() {
	window.dispatchEvent(new MouseEvent("mouseup"));
}

describe("dragToScroll", () => {
	test("scrolls the element by the dragged distance", () => {
		const { element } = setUpScrollableElement();

		mouseDownOn(element, 50, 50);
		mouseMoveTo(20, 40);
		mouseUp();

		expect(element.scrollLeft).toBe(30);
		expect(element.scrollTop).toBe(10);
	});

	test("keeps scrolling with momentum after release", async () => {
		const { element } = setUpScrollableElement();

		mouseDownOn(element, 90, 50);
		mouseMoveTo(70, 50);
		mouseMoveTo(50, 50);
		const scrollLeftAtRelease = element.scrollLeft;
		mouseUp();

		await vi.waitFor(() => {
			expect(element.scrollLeft).toBeGreaterThan(scrollLeftAtRelease);
		});
	});

	test("shows a grabbing cursor while dragging and restores it on release", () => {
		const { element, child } = setUpScrollableElement();

		mouseDownOn(element, 50, 50);
		mouseMoveTo(45, 50);
		expect(getComputedStyle(child).cursor).toBe("grabbing");

		mouseUp();
		expect(getComputedStyle(child).cursor).not.toBe("grabbing");
	});

	test("suppresses the click that concludes a drag", () => {
		const { element, child } = setUpScrollableElement();
		const onClick = vi.fn();
		child.addEventListener("click", onClick);

		mouseDownOn(element, 50, 50);
		mouseMoveTo(10, 50);
		mouseUp();
		child.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(onClick).not.toHaveBeenCalled();
	});

	test("lets a click through when the mouse barely moved", () => {
		const { element, child } = setUpScrollableElement();
		const onClick = vi.fn();
		child.addEventListener("click", onClick);

		mouseDownOn(element, 50, 50);
		mouseMoveTo(47, 50);
		mouseUp();
		child.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(onClick).toHaveBeenCalledTimes(1);
	});

	test("lets a later click through after a drag suppressed one", () => {
		const { element, child } = setUpScrollableElement();
		const onClick = vi.fn();
		child.addEventListener("click", onClick);

		mouseDownOn(element, 50, 50);
		mouseMoveTo(10, 50);
		mouseUp();

		mouseDownOn(element, 50, 50);
		mouseUp();
		child.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(onClick).toHaveBeenCalledTimes(1);
	});

	test("stops reacting to the mouse after cleanup", () => {
		const { element, detach } = setUpScrollableElement();

		detach();

		mouseDownOn(element, 50, 50);
		mouseMoveTo(20, 50);
		mouseUp();

		expect(element.scrollLeft).toBe(0);
	});
	test("suppresses scroll snap while dragging a snap container", () => {
		const { element } = setUpScrollableElement({ scrollSnap: true });

		mouseDownOn(element, 50, 50);
		mouseMoveTo(20, 50);

		expect(getComputedStyle(element).scrollSnapType).toBe("none");
		mouseUp();
	});

	test("restores scroll snap smoothly after a drag without momentum", () => {
		const { element } = setUpScrollableElement({ scrollSnap: true });

		mouseDownOn(element, 50, 50);
		mouseMoveTo(45, 50);
		mouseUp();

		expect(getComputedStyle(element).scrollSnapType).toBe("x mandatory");
		expect(element.style.scrollBehavior).toBe("smooth");

		element.dispatchEvent(new Event("scrollend"));
		expect(element.style.scrollBehavior).toBe("");
	});

	test("restores scroll snap after momentum scrolling ends", async () => {
		const { element } = setUpScrollableElement({ scrollSnap: true });

		mouseDownOn(element, 90, 50);
		mouseMoveTo(82, 50);
		mouseMoveTo(74, 50);
		mouseUp();

		expect(getComputedStyle(element).scrollSnapType).toBe("none");

		await vi.waitFor(
			() => {
				expect(getComputedStyle(element).scrollSnapType).toBe("x mandatory");
			},
			{ timeout: 3000 },
		);
	});

	test("clears the smooth scroll-behavior via the fallback timeout when no scrollend fires", () => {
		vi.useFakeTimers();
		try {
			const { element } = setUpScrollableElement({ scrollSnap: true });

			mouseDownOn(element, 50, 50);
			mouseMoveTo(45, 50);
			mouseUp();
			expect(element.style.scrollBehavior).toBe("smooth");

			vi.advanceTimersByTime(750);
			expect(element.style.scrollBehavior).toBe("");
		} finally {
			vi.useRealTimers();
		}
	});

	test("clears snap suppression on cleanup mid-drag", () => {
		const { element, detach } = setUpScrollableElement({ scrollSnap: true });

		mouseDownOn(element, 50, 50);
		mouseMoveTo(20, 50);
		detach();

		expect(getComputedStyle(element).scrollSnapType).toBe("x mandatory");
		expect(element.style.scrollBehavior).toBe("");
	});
});
