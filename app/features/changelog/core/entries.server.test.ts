import { describe, expect, test } from "vitest";
import * as Entries from "./entries.server";

describe("Entries.allEntries", () => {
	test("parses every committed changelog entry", () => {
		expect(() => Entries.allEntries()).not.toThrow();
	});

	test("gives every entry a headline", () => {
		for (const entry of Entries.allEntries()) {
			expect(entry.headline).not.toBe("");
		}
	});

	test("reads entries that list many nav items", () => {
		const entries = Entries.allEntries();

		expect(
			entries.some((entry) => (entry.navItems?.length ?? 0) > 1),
		).toBeTruthy();
	});
});
