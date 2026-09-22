import { afterEach, describe, expect, test, vi } from "vitest";
import { isScrollLocked, lockScroll } from "./scroll-lock";

let cleanupFns: Array<() => void> = [];

afterEach(async () => {
	for (const cleanup of cleanupFns) {
		cleanup();
	}
	cleanupFns = [];
	await vi.waitFor(() => expect(isScrollLocked()).toBe(false));
});

/** The release lands a moment after the last lock goes, this outwaits it. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

/** Content spanning the page, which must not move when the scrollbar goes. */
function makePageScroll() {
	const content = document.createElement("div");
	content.style.height = "300vh";
	content.style.width = "100%";
	document.body.appendChild(content);
	cleanupFns.push(() => content.remove());
	return content;
}

describe("lockScroll", () => {
	test("hides the scrollbar without moving the content", async () => {
		const content = makePageScroll();
		const root = document.documentElement;
		const scrollbarWidth = window.innerWidth - root.clientWidth;
		const widthBefore = content.getBoundingClientRect().width;

		const release = lockScroll();
		cleanupFns.push(release);

		expect(document.body.style.overflow).toBe("hidden");
		expect(content.getBoundingClientRect().width).toBe(widthBefore);
		if (scrollbarWidth > 0) {
			expect(Number.parseFloat(document.body.style.paddingRight)).toBe(
				scrollbarWidth,
			);
			expect(root.style.getPropertyValue("--scrollbar-width")).toBe(
				`${scrollbarWidth}px`,
			);
		}

		release();
		await vi.waitFor(() => expect(document.body.style.overflow).toBe(""));
		expect(document.body.style.paddingRight).toBe("");
		expect(root.style.getPropertyValue("--scrollbar-width")).toBe("");
		expect(content.getBoundingClientRect().width).toBe(widthBefore);
	});

	test("keeps the page locked until every lock is released", async () => {
		const releaseFirst = lockScroll();
		const releaseSecond = lockScroll();
		cleanupFns.push(releaseFirst, releaseSecond);

		releaseFirst();
		await settle();
		expect(document.body.style.overflow).toBe("hidden");
		expect(isScrollLocked()).toBe(true);

		releaseSecond();
		await vi.waitFor(() => expect(document.body.style.overflow).toBe(""));
		expect(isScrollLocked()).toBe(false);
	});

	test("lets a lock taken right after the last release keep the styles in place", async () => {
		const releaseFirst = lockScroll();
		releaseFirst();
		const releaseSecond = lockScroll();
		cleanupFns.push(releaseSecond);

		await settle();

		expect(document.body.style.overflow).toBe("hidden");
		expect(isScrollLocked()).toBe(true);
	});

	test("puts back the inline styles it replaced", async () => {
		document.body.style.overflow = "scroll";
		cleanupFns.push(() => document.body.style.removeProperty("overflow"));

		const release = lockScroll();
		expect(document.body.style.overflow).toBe("hidden");

		release();
		await vi.waitFor(() => expect(document.body.style.overflow).toBe("scroll"));
	});

	test("releasing the same lock twice does not release another", async () => {
		const releaseFirst = lockScroll();
		const releaseSecond = lockScroll();
		cleanupFns.push(releaseSecond);

		releaseFirst();
		releaseFirst();
		await settle();

		expect(document.body.style.overflow).toBe("hidden");
	});
});
