import { describe, expect, test } from "vitest";
import {
	errorToastRedirect,
	paginate,
	safeReturnTo,
	successToast,
	successToastWithRedirect,
} from "./remix.server";
import { runWithRequestContext } from "./request-context.server";

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

describe("safeReturnTo()", () => {
	test.each([
		["/u/sendou", "a same-site path"],
		["/calendar?page=2", "a path with search params"],
		["/", "the root path"],
	])("returns %s (%s)", (value) => {
		expect(safeReturnTo(value)).toBe(value);
	});

	test.each([
		["//evil.com", "protocol-relative URL"],
		["/\\evil.com", "backslash the browser normalises to a slash"],
		["/\\\\evil.com", "double backslash"],
		["https://evil.com", "absolute URL"],
		["evil.com", "no leading slash"],
		["\\/evil.com", "leading backslash"],
	])("returns null for %s (%s)", (value) => {
		expect(safeReturnTo(value)).toBeNull();
	});

	test("returns null for a non-string value", () => {
		expect(safeReturnTo(null)).toBeNull();
	});
});

describe("successToastWithRedirect()", () => {
	test.each([
		["Bo3 & Bo5 updated", "an ampersand"],
		["Set #3 reported", "a hash"],
		["100% complete", "a percent sign"],
		["Team + org linked", "a plus sign"],
	])("round trips a message containing %s (%s)", (message) => {
		const response = successToastWithRedirect({ message, url: "/to/1" });
		const location = response.headers.get("Location")!;

		expect(new URLSearchParams(location.split("?")[1]).get("__success")).toBe(
			message,
		);
	});

	test("keeps the search params already on the url", () => {
		const response = successToastWithRedirect({
			message: "Tournament finalized",
			url: "/to/1/brackets?bracket=1",
		});

		const searchParams = new URLSearchParams(
			response.headers.get("Location")!.split("?")[1],
		);

		expect(searchParams.get("bracket")).toBe("1");
		expect(searchParams.get("__success")).toBe("Tournament finalized");
	});

	test("keeps the hash at the end of the url", () => {
		const response = successToastWithRedirect({
			message: "Saved",
			url: "/u/sendou#results",
		});

		expect(response.headers.get("Location")).toBe(
			"/u/sendou?__success=Saved#results",
		);
	});
});

describe("errorToastRedirect()", () => {
	const redirectLocationOf = (url: string, message: string) =>
		runWithRequestContext({ url: new URL(url) }, () =>
			errorToastRedirect(message).headers.get("Location"),
		);

	test("keeps the search params of the current request", () => {
		expect(
			redirectLocationOf("https://sendou.ink/q/match/1?tab=action", "No"),
		).toBe("/q/match/1?tab=action&__error=No");
	});

	test("replaces a toast param already on the current request", () => {
		expect(
			redirectLocationOf(
				"https://sendou.ink/q/match/1?tab=action&__success=Reported",
				"No",
			),
		).toBe("/q/match/1?tab=action&__error=No");
	});
});

describe("successToast()", () => {
	test("keeps the search params of the current request", () => {
		const location = runWithRequestContext(
			{ url: new URL("https://sendou.ink/to/1/brackets?bracket=1") },
			() => successToast("Saved").headers.get("Location"),
		);

		expect(location).toBe("/to/1/brackets?bracket=1&__success=Saved");
	});
});
