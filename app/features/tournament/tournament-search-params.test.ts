import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import {
	tournamentJoinSearchParams,
	tournamentSearchSearchParams,
	tournamentTeamsSearchParams,
} from "./tournament-search-params";

describe("tournamentSearchSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(tournamentSearchSearchParams, {
			q: ["", "paddling pool", "with spaces & symbols?"],
			limit: [25, 1, 6],
			minStartTime: [new Date("2024-01-01T00:00:00.000Z")],
			maxStartTime: [new Date("2026-08-02T12:34:56.789Z")],
		});
	});

	it("decodes garbage to defaults", () => {
		assertDecodesToDefault(tournamentSearchSearchParams, "limit", [
			["0"],
			["26"],
			["abc"],
		]);
		assertDecodesToDefault(tournamentSearchSearchParams, "minStartTime", [
			["not-a-date"],
		]);
		assertDecodesToDefault(tournamentSearchSearchParams, "maxStartTime", [
			["not-a-date"],
		]);
	});
});

describe("tournamentJoinSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(tournamentJoinSearchParams, {
			code: ["abc123XYZ", "F3-9_xyz"],
		});
	});
});

describe("tournamentTeamsSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(tournamentTeamsSearchParams, {
			page: [1, 2, 17],
		});
	});

	it("decodes garbage to defaults", () => {
		assertDecodesToDefault(tournamentTeamsSearchParams, "page", [
			["0"],
			["abc"],
		]);
	});
});
