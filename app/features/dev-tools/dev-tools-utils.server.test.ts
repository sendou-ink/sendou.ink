import { afterEach, describe, expect, test } from "bun:test";
import { requireDevTools } from "./dev-tools-utils.server";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
	process.env.NODE_ENV = originalNodeEnv;
});

const requestWith = (fetchSite: string | null) =>
	new Request("http://localhost:5173/dev/server", {
		headers: fetchSite ? { "Sec-Fetch-Site": fetchSite } : {},
	});

const thrownStatus = (fn: () => void) => {
	try {
		fn();
	} catch (error) {
		if (error instanceof Response) return error.status;
		throw error;
	}

	return null;
};

describe("requireDevTools", () => {
	test.each([
		{ fetchSite: "same-origin", why: "the toolbar" },
		{ fetchSite: "none", why: "a link opened from a terminal" },
		{ fetchSite: null, why: "the CLI" },
	])("lets $why through", ({ fetchSite }) => {
		expect(() => requireDevTools(requestWith(fetchSite))).not.toThrow();
	});

	test.each(["cross-site", "same-site"])(
		"rejects a request another site's page made (%s)",
		(fetchSite) => {
			expect(thrownStatus(() => requireDevTools(requestWith(fetchSite)))).toBe(
				403,
			);
		},
	);

	test("responds 404 to a same-origin request in production", () => {
		process.env.NODE_ENV = "production";

		expect(
			thrownStatus(() => requireDevTools(requestWith("same-origin"))),
		).toBe(404);
	});
});
