import { describe, expect, it } from "vitest";
import { redirectIfPageOutOfBounds } from "./remix.server";

const buildRequest = (url: string) => new Request(url);

const captureRedirect = (fn: () => void) => {
	try {
		fn();
	} catch (thrown) {
		if (thrown instanceof Response) return thrown;
		throw thrown;
	}
	return null;
};

describe("redirectIfPageOutOfBounds()", () => {
	it("does not redirect when page is within bounds", () => {
		const response = captureRedirect(() =>
			redirectIfPageOutOfBounds({
				request: buildRequest("https://sendou.ink/vods?page=2"),
				page: 2,
				pagesCount: 5,
			}),
		);

		expect(response).toBeNull();
	});

	it("does not redirect when page equals pagesCount", () => {
		const response = captureRedirect(() =>
			redirectIfPageOutOfBounds({
				request: buildRequest("https://sendou.ink/vods?page=5"),
				page: 5,
				pagesCount: 5,
			}),
		);

		expect(response).toBeNull();
	});

	it("redirects to last page when page exceeds pagesCount", () => {
		const response = captureRedirect(() =>
			redirectIfPageOutOfBounds({
				request: buildRequest("https://sendou.ink/vods?page=99"),
				page: 99,
				pagesCount: 5,
			}),
		);

		expect(response).not.toBeNull();
		expect(response?.headers.get("Location")).toBe("/vods?page=5");
	});

	it("preserves other search params when redirecting", () => {
		const response = captureRedirect(() =>
			redirectIfPageOutOfBounds({
				request: buildRequest(
					"https://sendou.ink/vods?type=TOURNAMENT&page=99&mode=SZ",
				),
				page: 99,
				pagesCount: 3,
			}),
		);

		const location = response?.headers.get("Location");
		expect(location).not.toBeNull();
		const locationUrl = new URL(location!, "https://sendou.ink");
		expect(locationUrl.pathname).toBe("/vods");
		expect(locationUrl.searchParams.get("page")).toBe("3");
		expect(locationUrl.searchParams.get("type")).toBe("TOURNAMENT");
		expect(locationUrl.searchParams.get("mode")).toBe("SZ");
	});

	it("does not redirect on page 1 when pagesCount is 0 (empty results)", () => {
		const response = captureRedirect(() =>
			redirectIfPageOutOfBounds({
				request: buildRequest("https://sendou.ink/vods?page=1"),
				page: 1,
				pagesCount: 0,
			}),
		);

		expect(response).toBeNull();
	});

	it("redirects to page 1 when pagesCount is 0 and page exceeds 1", () => {
		const response = captureRedirect(() =>
			redirectIfPageOutOfBounds({
				request: buildRequest("https://sendou.ink/vods?page=4"),
				page: 4,
				pagesCount: 0,
			}),
		);

		expect(response?.headers.get("Location")).toBe("/vods?page=1");
	});
});
