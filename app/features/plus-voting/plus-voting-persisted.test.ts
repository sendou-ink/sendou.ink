import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import { plusVotingPersisted } from "./plus-voting-persisted";

describe("plusVotingPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(plusVotingPersisted, [
			null,
			{
				month: 5,
				year: 2026,
				votes: [{ votedId: 2, score: 1 }],
				usersForVotingOrder: { "2": 0, "3": 1 },
			},
		]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(plusVotingPersisted, [
			"not json",
			'{"month":5}',
			'{"month":5,"year":2026,"votes":"x","usersForVotingOrder":{}}',
		]);
	});
});
