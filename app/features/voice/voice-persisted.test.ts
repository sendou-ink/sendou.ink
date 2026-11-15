import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import {
	callToRejoinPersisted,
	micEnabledPersisted,
	voiceSettingsPersisted,
} from "./voice-persisted";

describe("voiceSettingsPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(voiceSettingsPersisted, [
			voiceSettingsPersisted.default,
			{
				inputDeviceId: "usb-mic",
				outputDeviceId: "headset",
				inputVolume: 150,
				outputVolume: 40,
				sensitivity: 0,
				noiseSuppression: false,
				echoCancellation: false,
				autoGainControl: false,
				sounds: false,
			},
		]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(voiceSettingsPersisted, ["{}", "true", "[]"]);
	});
});

describe("callToRejoinPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(callToRejoinPersisted, [
			null,
			{ roomId: 1, at: 1_700_000_000_000, kind: "CLOSED" },
			{ roomId: 2, at: 1_700_000_000_000, kind: "HIDDEN" },
		]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(callToRejoinPersisted, [
			"{}",
			'{"roomId":1,"leftAt":1}',
			'{"roomId":1,"at":1,"kind":"GONE"}',
		]);
	});
});

describe("micEnabledPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(micEnabledPersisted, [true, false]);
	});
});
