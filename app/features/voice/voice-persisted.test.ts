import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import { voiceSettingsPersisted } from "./voice-persisted";

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
