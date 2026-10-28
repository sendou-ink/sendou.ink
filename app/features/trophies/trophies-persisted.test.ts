import { describe, expect, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import { trophyTermsAgreedPersisted } from "./trophies-persisted";

describe("trophyTermsAgreedPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(trophyTermsAgreedPersisted, [true, false]);
	});

	test("decodes legacy plain-string values", () => {
		expect(trophyTermsAgreedPersisted.decode("true")).toBe(true);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(trophyTermsAgreedPersisted, ["yes"]);
	});
});
