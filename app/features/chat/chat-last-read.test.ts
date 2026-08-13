import { describe, expect, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import { lastReadCountsPersisted } from "./chat-last-read";

describe("lastReadCountsPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(lastReadCountsPersisted, [0, 42]);
	});

	test("decodes legacy raw number strings", () => {
		expect(lastReadCountsPersisted.decode("7")).toBe(7);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(lastReadCountsPersisted, ["abc", "", "Infinity"]);
	});
});
