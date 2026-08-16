import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import { revealedTournamentsPersisted } from "./useSpoilerFree";

describe("revealedTournamentsPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(revealedTournamentsPersisted, [[], [1, 2, 3]]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(revealedTournamentsPersisted, ["not json", "1"]);
	});
});
