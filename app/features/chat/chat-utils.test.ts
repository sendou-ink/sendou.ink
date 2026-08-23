import { describe, expect, test } from "vitest";
import { datePlaceholder } from "./chat-utils";

describe("datePlaceholder", () => {
	test("returns correctly formatted placeholder string", () => {
		const date = new Date(1700000000000);

		expect(datePlaceholder(date)).toBe("{{date:1700000000000}}");
	});
});
