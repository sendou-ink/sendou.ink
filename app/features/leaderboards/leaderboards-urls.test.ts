import { describe, expect, test } from "bun:test";
import { leaderboardsPage } from "./leaderboards-urls";

describe("leaderboardsPage()", () => {
	test("encodes season 0 in the query string", () => {
		const url = leaderboardsPage({ season: 0, type: "USER" });

		const params = new URLSearchParams(url.split("?")[1]);
		expect(params.get("season")).toBe("0");
	});
});
