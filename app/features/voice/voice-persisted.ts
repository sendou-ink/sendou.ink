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
		sensitivity: 30,
		noiseSuppression: true,
		echoCancellation: true,
		autoGainControl: true,
		sounds: true,
	},
});

export type VoiceSettings = (typeof voiceSettingsPersisted)["default"];

/**
 * The call this tab's page was in when it went away: `CLOSED` by unloading (a reload), `HIDDEN` by being
 * hidden, which the page outlives unless the browser discards it in the background.
 */
export const callToRejoinPersisted = PersistedState.define({
	key: "voiceCallToRejoin",
	storage: "session",
	schema: v.nullable(
		v.object({
			roomId: v.number(),
			at: v.number(),
			kind: v.picklist(["CLOSED", "HIDDEN"]),
		}),
	),
	default: null,
});

export type RememberedCall = NonNullable<
	(typeof callToRejoinPersisted)["default"]
>;

export const micEnabledPersisted = PersistedState.define({
	key: "voiceMicEnabled",
	storage: "local",
	schema: v.boolean(),
	default: false,
});
