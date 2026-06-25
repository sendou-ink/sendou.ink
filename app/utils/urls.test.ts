import { describe, expect, it } from "vitest";
import {
	leaderboardsPage,
	tournamentOrganizationPage,
	userArtPage,
} from "./urls";

describe("leaderboardsPage()", () => {
	it("encodes season 0 in the query string", () => {
		const url = leaderboardsPage({ season: 0, type: "USER" });

		const params = new URLSearchParams(url.split("?")[1]);
		expect(params.get("season")).toBe("0");
	});
});

describe("userArtPage()", () => {
	it("joins source and bigArtId params with a single query string", () => {
		const url = userArtPage({ discordId: "123" }, "MADE-BY", 456);

		const params = new URLSearchParams(url.split("?")[1]);
		expect(params.get("source")).toBe("MADE-BY");
		expect(params.get("big")).toBe("456");
	});
});

describe("tournamentOrganizationPage()", () => {
	it("round-trips the tournament name through the source param", () => {
		const tournamentName = "100% Series";

		const url = tournamentOrganizationPage({
			organizationSlug: "sendou",
			tournamentName,
		});

		const params = new URLSearchParams(url.split("?")[1]);
		expect(params.get("source")).toBe(tournamentName);
	});
});
