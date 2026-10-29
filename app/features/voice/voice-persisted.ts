import * as v from "valibot";
import * as PersistedState from "~/modules/persisted-state/persisted-state";

export const DEFAULT_DEVICE_ID = "default";

export const voiceSettingsPersisted = PersistedState.define({
	key: "voiceSettings",
	storage: "local",
	schema: v.object({
		inputDeviceId: v.string(),
		outputDeviceId: v.string(),
		inputVolume: v.number(),
		outputVolume: v.number(),
		sensitivity: v.number(),
		noiseSuppression: v.boolean(),
		echoCancellation: v.boolean(),
		autoGainControl: v.boolean(),
		sounds: v.boolean(),
	}),
	default: {
		inputDeviceId: DEFAULT_DEVICE_ID,
		outputDeviceId: DEFAULT_DEVICE_ID,
		inputVolume: 100,
		outputVolume: 100,
		sensitivity: 40,
		noiseSuppression: true,
		echoCancellation: true,
		autoGainControl: true,
		sounds: true,
	},
});

export type VoiceSettings = (typeof voiceSettingsPersisted)["default"];
