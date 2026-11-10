import { describe, expect, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import { broadcastLinkPersisted, linkedBroadcast } from "./scanner-activity";

const HOUR_MS = 60 * 60 * 1000;

describe("broadcastLinkPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(broadcastLinkPersisted, [
			null,
			{ tournamentId: 1234, slug: "sendouink", linkedAt: 1_700_000_000_000 },
		]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(broadcastLinkPersisted, [
			"not json",
			'{"tournamentId":1.5,"slug":"sendouink","linkedAt":0}',
			'{"tournamentId":1234}',
		]);
	});
});

describe("linkedBroadcast", () => {
	test.each([
		{ why: "a link made an hour ago", ageMs: HOUR_MS, isLinked: true },
		{ why: "a link made two days ago", ageMs: 48 * HOUR_MS, isLinked: false },
	])("$why", ({ ageMs, isLinked }) => {
		const link = {
			tournamentId: 1234,
			slug: "sendouink",
			linkedAt: Date.now() - ageMs,
		};

		expect(linkedBroadcast(link)).toEqual(isLinked ? link : null);
	});
});
