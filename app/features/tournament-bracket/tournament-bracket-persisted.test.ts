import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import { bracketScrollPositionPersisted } from "./tournament-bracket-persisted";

describe("bracketScrollPositionPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(bracketScrollPositionPersisted, [
			null,
			{ left: 0, top: 0, windowY: 0 },
			{ left: 1200.5, top: 340, windowY: 812 },
		]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(bracketScrollPositionPersisted, [
			"not json",
			'{"left":"a","top":0,"windowY":0}',
			'{"left":10,"top":0}',
		]);
	});
});
