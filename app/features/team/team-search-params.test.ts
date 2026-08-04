import { describe, it } from "vitest";
import { assertRoundTrips } from "~/modules/search-params/search-params-test-utils";
import { teamJoinSearchParams } from "./team-search-params";

describe("teamJoinSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(teamJoinSearchParams, {
			code: ["abcd1234", "F3-9_xyz"],
		});
	});
});
