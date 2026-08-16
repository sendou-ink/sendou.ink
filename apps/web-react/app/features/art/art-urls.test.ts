import { describe, expect, test } from "vitest";
import { userArtPage } from "./art-urls";

describe("userArtPage()", () => {
	test("joins source and bigArtId params with a single query string", () => {
		const url = userArtPage({ discordId: "123" }, "MADE-BY", 456);

		const params = new URLSearchParams(url.split("?")[1]);
		expect(params.get("source")).toBe("MADE-BY");
		expect(params.get("big")).toBe("456");
	});
});
