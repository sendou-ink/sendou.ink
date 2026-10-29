import { describe, expect, test } from "vitest";
import { voiceSettingsPersisted } from "../voice-persisted";
import * as MicInput from "./MicInput";

const SETTINGS = voiceSettingsPersisted.default;
const ALL_SUPPORTED: MediaTrackSupportedConstraints = {
	echoCancellation: true,
	noiseSuppression: true,
	autoGainControl: true,
};

describe("MicInput.rms", () => {
	test.each([
		{ why: "no samples", samples: [], expected: 0 },
		{ why: "silence", samples: [0, 0, 0, 0], expected: 0 },
		{ why: "full scale square wave", samples: [1, -1, 1, -1], expected: 1 },
		{ why: "half scale", samples: [0.5, -0.5], expected: 0.5 },
	])("$why", ({ samples, expected }) => {
		expect(MicInput.rms(new Float32Array(samples))).toBeCloseTo(expected);
	});
});

describe("MicInput.meterPosition", () => {
	test.each([
		{ why: "silence", level: 0, expected: 0 },
		{ why: "below the floor", level: 10 ** (-90 / 20), expected: 0 },
		{ why: "at the floor", level: 10 ** (-70 / 20), expected: 0 },
		{ why: "halfway", level: 10 ** (-40 / 20), expected: 50 },
		{ why: "at the ceiling", level: 10 ** (-10 / 20), expected: 100 },
		{ why: "full scale", level: 1, expected: 100 },
	])("$why", ({ level, expected }) => {
		expect(MicInput.meterPosition(level)).toBeCloseTo(expected);
	});
});

describe("MicInput.gateThreshold", () => {
	test("a sensitivity of 0 keeps the gate open", () => {
		expect(MicInput.gateThreshold(0)).toBe(0);
	});

	test.each([30, 50, 100])(
		"opens where the meter shows sensitivity %s",
		(sensitivity) => {
			expect(
				MicInput.meterPosition(MicInput.gateThreshold(sensitivity)),
			).toBeCloseTo(sensitivity);
		},
	);
});

describe("MicInput.captureConstraints", () => {
	test("leaves the device to the browser for the default one", () => {
		expect(
			MicInput.captureConstraints(SETTINGS, ALL_SUPPORTED).deviceId,
		).toBeUndefined();
	});

	test("requires the picked device", () => {
		expect(
			MicInput.captureConstraints(
				{ ...SETTINGS, inputDeviceId: "usb-mic" },
				ALL_SUPPORTED,
			).deviceId,
		).toEqual({ exact: "usb-mic" });
	});

	test("passes the processing switches", () => {
		expect(
			MicInput.captureConstraints(
				{ ...SETTINGS, echoCancellation: false, autoGainControl: false },
				ALL_SUPPORTED,
			),
		).toEqual({
			echoCancellation: false,
			noiseSuppression: false,
			autoGainControl: false,
		});
	});

	test("keeps the browser's noise suppression off even when ours is on", () => {
		expect(SETTINGS.noiseSuppression).toBe(true);
		expect(
			MicInput.captureConstraints(SETTINGS, ALL_SUPPORTED).noiseSuppression,
		).toBe(false);
	});

	test("leaves out processing the browser can't switch", () => {
		expect(
			MicInput.captureConstraints(SETTINGS, { echoCancellation: true }),
		).toEqual({ echoCancellation: true });
	});
});

describe("MicInput.needsRecapture", () => {
	test.each([
		{ why: "nothing changed", patch: {}, expected: false },
		{ why: "volume only", patch: { inputVolume: 50 }, expected: false },
		{ why: "sensitivity only", patch: { sensitivity: 80 }, expected: false },
		{ why: "another device", patch: { inputDeviceId: "usb" }, expected: true },
		{
			why: "processing switched",
			patch: { echoCancellation: false },
			expected: true,
		},
		{
			why: "noise suppression only",
			patch: { noiseSuppression: false },
			expected: false,
		},
	])("$why", ({ patch, expected }) => {
		expect(MicInput.needsRecapture(SETTINGS, { ...SETTINGS, ...patch })).toBe(
			expected,
		);
	});
});
