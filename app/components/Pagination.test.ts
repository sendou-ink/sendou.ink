import { describe, expect, it } from "vitest";
import { getPageNumbers } from "./Pagination";

/** What is rendered on a narrow (mobile) viewport — `desktopOnly` items are hidden. */
function mobileView(currentPage: number, pagesCount: number) {
	return getPageNumbers(currentPage, pagesCount)
		.filter((item) => !item.desktopOnly)
		.map((item) => item.value);
}

/** What is rendered on a wide (desktop) viewport — `mobileOnly` items are hidden. */
function desktopView(currentPage: number, pagesCount: number) {
	return getPageNumbers(currentPage, pagesCount)
		.filter((item) => !item.mobileOnly)
		.map((item) => item.value);
}

describe("getPageNumbers", () => {
	it("shows every page without ellipsis when there are 5 or fewer", () => {
		expect(mobileView(2, 5)).toEqual([1, 2, 3, 4, 5]);
		expect(desktopView(2, 5)).toEqual([1, 2, 3, 4, 5]);
	});

	it("shows every page on desktop when there are 9 or fewer", () => {
		expect(desktopView(2, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
		expect(desktopView(5, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
	});

	it("inserts a mobile ellipsis instead of silently hiding middle pages", () => {
		// Regression: page=2 of 9 used to render "1 2 8 9" with no ellipsis
		expect(mobileView(2, 9)).toEqual([1, 2, 3, "...", 9]);
	});

	it("shows a bridging number on the first page instead of a lonely jump", () => {
		// Regression: page=1 of 8 used to render "1 2 ... 8" with nothing in between
		expect(mobileView(1, 8)).toEqual([1, 2, 3, "...", 8]);
		expect(mobileView(1, 20)).toEqual([1, 2, 3, "...", 20]);
		expect(desktopView(1, 20)).toEqual([1, 2, 3, 4, "...", 20]);
	});

	it("shows a bridging number on the last page instead of a lonely jump", () => {
		expect(mobileView(8, 8)).toEqual([1, "...", 6, 7, 8]);
		expect(mobileView(20, 20)).toEqual([1, "...", 18, 19, 20]);
		expect(desktopView(20, 20)).toEqual([1, "...", 17, 18, 19, 20]);
	});

	it("keeps the current page and its neighbours visible on mobile", () => {
		const view = mobileView(5, 9);
		expect(view).toContain(4);
		expect(view).toContain(5);
		expect(view).toContain(6);
		// no confusing jump straight from 1 to the middle
		expect(view).toEqual([1, "...", 4, 5, 6, "...", 9]);
	});

	it("always keeps the first and last page", () => {
		for (const currentPage of [1, 7, 20]) {
			const view = mobileView(currentPage, 20);
			expect(view[0]).toBe(1);
			expect(view.at(-1)).toBe(20);
		}
	});

	it("windows around the current page with ellipses on both sides for many pages", () => {
		expect(mobileView(10, 20)).toEqual([1, "...", 9, 10, 11, "...", 20]);
		expect(desktopView(10, 20)).toEqual([
			1,
			"...",
			8,
			9,
			10,
			11,
			12,
			"...",
			20,
		]);
	});

	it("omits the leading ellipsis when the current page is near the start", () => {
		expect(desktopView(2, 20)).toEqual([1, 2, 3, 4, "...", 20]);
		expect(mobileView(2, 20)).toEqual([1, 2, 3, "...", 20]);
	});

	it("omits the trailing ellipsis when the current page is near the end", () => {
		expect(desktopView(19, 20)).toEqual([1, "...", 17, 18, 19, 20]);
		expect(mobileView(19, 20)).toEqual([1, "...", 18, 19, 20]);
	});

	it("shows a bridging number instead of an ellipsis that hides a single page", () => {
		// An ellipsis takes the same space as one page number, so replacing a
		// lone hidden page with "..." is never an improvement (same intent as the
		// edge "lonely jump" fix, but for windows one step inward).
		// desktop window around page 5 of 10 leaves only page 2 hidden on the left
		expect(desktopView(5, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, "...", 10]);
		// ...and only page 9 hidden on the right for page 6 of 10
		expect(desktopView(6, 10)).toEqual([1, "...", 4, 5, 6, 7, 8, 9, 10]);
		// mobile window around page 3 of 6 leaves only page 5 hidden
		expect(mobileView(3, 6)).toEqual([1, 2, 3, 4, 5, 6]);
	});

	it("never renders an ellipsis in place of a single hidden page", () => {
		for (let pagesCount = 1; pagesCount <= 25; pagesCount++) {
			for (let currentPage = 1; currentPage <= pagesCount; currentPage++) {
				for (const view of [
					mobileView(currentPage, pagesCount),
					desktopView(currentPage, pagesCount),
				]) {
					for (let i = 1; i < view.length - 1; i++) {
						if (view[i] !== "...") continue;
						const prev = view[i - 1];
						const next = view[i + 1];
						if (typeof prev === "number" && typeof next === "number") {
							expect(next - prev).toBeGreaterThan(2);
						}
					}
				}
			}
		}
	});

	it("never produces duplicate page numbers", () => {
		for (let pagesCount = 1; pagesCount <= 25; pagesCount++) {
			for (let currentPage = 1; currentPage <= pagesCount; currentPage++) {
				const values = getPageNumbers(currentPage, pagesCount)
					.map((item) => item.value)
					.filter((value): value is number => value !== "...");
				expect(new Set(values).size).toBe(values.length);
			}
		}
	});

	it("always includes the current page in both views", () => {
		for (let pagesCount = 1; pagesCount <= 25; pagesCount++) {
			for (let currentPage = 1; currentPage <= pagesCount; currentPage++) {
				expect(mobileView(currentPage, pagesCount)).toContain(currentPage);
				expect(desktopView(currentPage, pagesCount)).toContain(currentPage);
			}
		}
	});
});
