import { describe, expect, test } from "vitest";
import { paginate } from "./remix.server";

const buildUrl = (url: string) => new URL(url);

const captureRedirect = (fn: () => void) => {
	try {
		fn();
	} catch (thrown) {
		if (thrown instanceof Response) return thrown;
		throw thrown;
	}
	return null;
};

describe("paginate()", () => {
	test("returns the page count rounded up", () => {
		const result = paginate({
			url: buildUrl("https://sendou.ink/vods?page=1"),
			page: 1,
			pageSize: 10,
			totalCount: 41,
		});

		expect(result).toEqual({ currentPage: 1, pagesCount: 5 });
	});

	test("does not redirect when page is within bounds", () => {
		const response = captureRedirect(() =>
			paginate({
				url: buildUrl("https://sendou.ink/vods?page=2"),
				page: 2,
				pageSize: 10,
				totalCount: 50,
			}),
		);

		expect(response).toBeNull();
	});

	test("does not redirect when page equals pagesCount", () => {
		const response = captureRedirect(() =>
			paginate({
				url: buildUrl("https://sendou.ink/vods?page=5"),
				page: 5,
				pageSize: 10,
				totalCount: 50,
			}),
		);

		expect(response).toBeNull();
	});

	test("redirects to last page when page exceeds pagesCount", () => {
		const response = captureRedirect(() =>
			paginate({
				url: buildUrl("https://sendou.ink/vods?page=99"),
				page: 99,
				pageSize: 10,
				totalCount: 50,
			}),
		);

		expect(response).not.toBeNull();
		expect(response?.headers.get("Location")).toBe("/vods?page=5");
	});

	test("preserves other search params when redirecting", () => {
		const response = captureRedirect(() =>
			paginate({
				url: buildUrl(
					"https://sendou.ink/vods?type=TOURNAMENT&page=99&mode=SZ",
				),
				page: 99,
				pageSize: 10,
				totalCount: 25,
			}),
		);

		const location = response?.headers.get("Location");
		expect(location).not.toBeNull();
		const locationUrl = new URL(location!, "https://sendou.ink");
		expect(locationUrl.pathname).toBe("/vods");
		// biome-ignore-start lint/plugin: asserting on the raw redirect URL is the point of the test
		expect(locationUrl.searchParams.get("page")).toBe("3");
		expect(locationUrl.searchParams.get("type")).toBe("TOURNAMENT");
		expect(locationUrl.searchParams.get("mode")).toBe("SZ");
		// biome-ignore-end lint/plugin: asserting on the raw redirect URL is the point of the test
	});

	test("stays on page 1 when there are no results", () => {
		const result = paginate({
			url: buildUrl("https://sendou.ink/vods?page=1"),
			page: 1,
			pageSize: 10,
			totalCount: 0,
		});

		expect(result).toEqual({ currentPage: 1, pagesCount: 1 });
	});

	test("redirects to page 1 when there are no results and page exceeds 1", () => {
		const response = captureRedirect(() =>
			paginate({
				url: buildUrl("https://sendou.ink/vods?page=4"),
				page: 4,
				pageSize: 10,
				totalCount: 0,
			}),
		);

		expect(response?.headers.get("Location")).toBe("/vods?page=1");
	});
});
