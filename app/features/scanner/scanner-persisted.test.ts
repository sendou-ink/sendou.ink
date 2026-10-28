import { describe, expect, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import {
	montageCollapsedGroupsPersisted,
	montageCriteriaPersisted,
} from "./scanner-persisted";

describe("montageCriteriaPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(montageCriteriaPersisted, [
			{ minKills: 4, maxSecondsByKills: { "3": 25 } },
		]);
	});

	test("an unreadable part falls back on its own", () => {
		expect(
			montageCriteriaPersisted.decode(
				'{"minKills":"x","maxSecondsByKills":{"3":25}}',
			),
		).toEqual({ minKills: 3, maxSecondsByKills: { "3": 25 } });
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(montageCriteriaPersisted, ["not json", "[]"]);
	});
});

describe("montageCollapsedGroupsPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(montageCollapsedGroupsPersisted, [[], ["40", "null"]]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(montageCollapsedGroupsPersisted, ["{}", "[1]"]);
	});
});
