import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import { clipVolumePersisted } from "./clip-volume";

describe("clipVolumePersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(clipVolumePersisted, [
			{ volume: 0.35, muted: false },
			{ volume: 1, muted: true },
			{ volume: 0, muted: false },
		]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(clipVolumePersisted, [
			"not json",
			'{"volume":2,"muted":false}',
			'{"volume":0.5}',
		]);
	});
});
