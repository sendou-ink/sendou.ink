import { describe, expect, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import { canPlaySourceAudio, scannerSettingsPersisted } from "./settings";

const SETTINGS = {
	sourceDeviceId: "abc",
	audioSource: "device:mic" as const,
	playSourceAudio: true,
	sourceAudioVolume: 0.4,
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

	test("an out of range volume falls back to full", () => {
		expect(
			scannerSettingsPersisted.decode(
				JSON.stringify({ ...SETTINGS, sourceAudioVolume: 3 }),
			).sourceAudioVolume,
		).toBe(1);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(scannerSettingsPersisted, ["not json"]);
	});
});

describe("canPlaySourceAudio", () => {
	test.each([
		{
			why: "the source's own audio",
			source: "source" as const,
			expected: true,
		},
		{ why: "a named input", source: "device:mic" as const, expected: true },
		{
			why: "desktop audio would echo",
			source: "desktop" as const,
			expected: false,
		},
		{ why: "no audio", source: "off" as const, expected: false },
	])("$why", ({ source, expected }) => {
		expect(canPlaySourceAudio(source)).toBe(expected);
	});
});
