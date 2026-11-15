import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import { streamDeckAutoConnectPersisted } from "./stream-deck-persisted";

describe("streamDeckAutoConnectPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(streamDeckAutoConnectPersisted, [true, false]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(streamDeckAutoConnectPersisted, [
			"not json",
			"1",
			'"false"',
		]);
	});
});
