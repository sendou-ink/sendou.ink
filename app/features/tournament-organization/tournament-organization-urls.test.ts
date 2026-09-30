import { describe, expect, test } from "vitest";
import { tournamentOrganizationPage } from "./tournament-organization-urls";

describe("tournamentOrganizationPage()", () => {
	test("round-trips the tournament name through the source param", () => {
		const tournamentName = "100% Series";

		const url = tournamentOrganizationPage({
			organizationSlug: "sendou",
			tournamentName,
		});

		const params = new URLSearchParams(url.split("?")[1]);
		expect(params.get("source")).toBe(tournamentName);
	});
});
