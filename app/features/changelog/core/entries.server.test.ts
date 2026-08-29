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
});
