import { DEFAULT_DEVICE_ID, type VoiceSettings } from "../voice-persisted";

const METER_FLOOR_DB = -70;
const METER_CEILING_DB = -10;

type CaptureSettings = Pick<
	VoiceSettings,
	"inputDeviceId" | "echoCancellation" | "autoGainControl"
>;

export function rms(samples: Float32Array) {
	if (samples.length === 0) return 0;

	let sum = 0;
	for (const sample of samples) sum += sample * sample;

	return Math.sqrt(sum / samples.length);
}

export function meterPosition(level: number) {
	if (level <= 0) return 0;

	const decibels = 20 * Math.log10(level);
	const position =
		((decibels - METER_FLOOR_DB) / (METER_CEILING_DB - METER_FLOOR_DB)) * 100;

	return Math.min(100, Math.max(0, position));
}

export function gateThreshold(sensitivity: number) {
	if (sensitivity <= 0) return 0;

	const decibels =
		METER_FLOOR_DB +
		(Math.min(100, sensitivity) / 100) * (METER_CEILING_DB - METER_FLOOR_DB);

	return 10 ** (decibels / 20);
}

export function captureConstraints(
	settings: CaptureSettings,
	supported: MediaTrackSupportedConstraints,
): MediaTrackConstraints {
	const constraints: MediaTrackConstraints = {};

	if (settings.inputDeviceId !== DEFAULT_DEVICE_ID) {
		constraints.deviceId = { exact: settings.inputDeviceId };
	}
	if (supported.echoCancellation) {
		constraints.echoCancellation = settings.echoCancellation;
	}
	if (supported.noiseSuppression) {
		constraints.noiseSuppression = false;
	}
	if (supported.autoGainControl) {
		constraints.autoGainControl = settings.autoGainControl;
	}

	return constraints;
}

export function needsRecapture(
	previous: CaptureSettings,
	next: CaptureSettings,
) {
	return (
		previous.inputDeviceId !== next.inputDeviceId ||
		previous.echoCancellation !== next.echoCancellation ||
		previous.autoGainControl !== next.autoGainControl
	);
}
