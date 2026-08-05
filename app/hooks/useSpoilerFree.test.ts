import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import { revealedTournamentsPersisted } from "./useSpoilerFree";

describe("revealedTournamentsPersisted", () => {
	it("round-trips", () => {
		assertRoundTrips(revealedTournamentsPersisted, [[], [1, 2, 3]]);
	});

	it("malformed values decode to the default", () => {
		assertDecodesToDefault(revealedTournamentsPersisted, ["not json", "1"]);
	});
});
