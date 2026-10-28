import { describe, expect, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import {
	cooldownsPersisted,
	lastActiveTabPersisted,
	soundEnabledPersisted,
	soundVolumePersisted,
} from "./chat-persisted";

describe("soundEnabledPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(soundEnabledPersisted, [true, false]);
	});

	test("decodes legacy plain-string values", () => {
		expect(soundEnabledPersisted.decode("false")).toBe(false);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(soundEnabledPersisted, ["yes", "1"]);
	});
});

describe("soundVolumePersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(soundVolumePersisted, [0, 55.5, 100]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(soundVolumePersisted, ["loud", "101", "-1"]);
	});
});

describe("cooldownsPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(cooldownsPersisted, [{}, { "mention:1": 6_000 }]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(cooldownsPersisted, ["not json", '{"a":"b"}']);
	});
});

describe("lastActiveTabPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(lastActiveTabPersisted, [null, "abc123"]);
	});

	test("decodes legacy plain-string values", () => {
		expect(lastActiveTabPersisted.decode("abc123")).toBe("abc123");
	});
});
