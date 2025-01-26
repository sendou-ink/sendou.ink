import { describe, expect, test } from "vitest";
import { pathnameFromPotentialURL } from "./strings";

describe("pathnameFromPotentialURL()", () => {
	test("Resolves path name from valid URL", () => {
		expect(pathnameFromPotentialURL("https://bsky.app/sendouc")).toBe(
			"sendouc",
		);
	});

	test("Returns string as is if not URL", () => {
		expect(pathnameFromPotentialURL("sendouc")).toBe("sendouc");
	});
});
