import { describe, expect, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import { scannerSettingsPersisted } from "./settings";

const SETTINGS = {
	sourceDeviceId: "abc",
	audioSource: "device:mic" as const,
	upload: false,
	saveClips: true,
	clipMinKills: 5 as const,
	audioOffsetMs: -250,
	webgpu: false,
};

describe("scannerSettingsPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(scannerSettingsPersisted, [SETTINGS]);
	});

	test("an unreadable setting falls back on its own", () => {
		expect(
			scannerSettingsPersisted.decode(
				JSON.stringify({ ...SETTINGS, clipMinKills: 7, audioSource: "radio" }),
			),
		).toEqual({ ...SETTINGS, clipMinKills: 4, audioSource: "source" });
	});

	test("clamps the audio offset", () => {
		expect(
			scannerSettingsPersisted.decode(
				JSON.stringify({ ...SETTINGS, audioOffsetMs: 10_000 }),
			).audioOffsetMs,
		).toBe(2000);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(scannerSettingsPersisted, ["not json"]);
	});
});
