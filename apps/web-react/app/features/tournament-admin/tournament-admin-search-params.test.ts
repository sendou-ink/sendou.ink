import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import {
	tournamentAuditSearchParams,
	tournamentImportTeamsSearchParams,
} from "./tournament-admin-search-params";

describe("tournamentAuditSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(tournamentAuditSearchParams, {
			page: [1, 2, 100],
			auditType: ["MEMBER_ADDED", "UPDATE_IN_GAME_NAME"],
			auditTeam: [1, 12345],
		});
	});

	test("decodes garbage to defaults", () => {
		assertDecodesToDefault(tournamentAuditSearchParams, "page", [
			["0"],
			["-1"],
			["abc"],
			["1.5"],
		]);
		assertDecodesToDefault(tournamentAuditSearchParams, "auditType", [
			["NOT_A_TYPE"],
		]);
		assertDecodesToDefault(tournamentAuditSearchParams, "auditTeam", [
			["-5"],
			["abc"],
		]);
	});
});

describe("tournamentImportTeamsSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(tournamentImportTeamsSearchParams, {
			fromTournamentId: [1, 999999],
		});
	});

	test("decodes garbage to defaults", () => {
		assertDecodesToDefault(
			tournamentImportTeamsSearchParams,
			"fromTournamentId",
			[["0"], ["abc"]],
		);
	});
});
