/**
 * The scanner's settings, kept in localStorage: the capture source, what
 * clips hear, whether results upload to sendou.ink, whether live clips are
 * saved and whether matching runs on the GPU. Read through a store so the controllers (outside React) and
 * the views see one value.
 */
import * as v from "valibot";
import { usePersistedState } from "~/modules/persisted-state/hooks";
import * as PersistedState from "~/modules/persisted-state/persisted-state";

export interface ScannerSettings {
	/** `deviceId` of the video input; empty or unplugged = the first capture card or OBS Virtual Camera */
	sourceDeviceId: string;
	/** what live clips hear */
	audioSource: AudioSource;
	/** upload results to sendou.ink as games end (needs a login) */
	upload: boolean;
	/** keep the live ring buffer and cut clips of the best moments */
	saveClips: boolean;
	/** splats in a row that make a clip */
	clipMinKills: ClipMinKills;
	/** milliseconds the clips' sound is moved later (negative: earlier) against the picture */
	audioOffsetMs: number;
	/** match on the GPU (WebGPU) when the browser has one; results are identical either way */
	webgpu: boolean;
}

export const CLIP_MIN_KILLS_OPTIONS = [3, 4, 5] as const;
export type ClipMinKills = (typeof CLIP_MIN_KILLS_OPTIONS)[number];

/**
 * `source`: the video input's own audio side; `desktop`: the system's sound
 * through the share picker; `off`: silent clips; `device:<id>`: a named
 * audio input (a loopback device, say).
 */
export type AudioSource = "source" | "desktop" | "off" | `device:${string}`;

/** two seconds either way covers any capture card against any audio path */
export const AUDIO_OFFSET_LIMIT_MS = 2000;

const DEFAULT_SETTINGS: ScannerSettings = {
	sourceDeviceId: "",
	audioSource: "source",
	upload: true,
	saveClips: true,
	clipMinKills: 4,
	audioOffsetMs: 0,
	webgpu: true,
};

/** An unreadable setting falls back to its default on its own */
export const scannerSettingsPersisted = PersistedState.define({
	key: "scanner:settings",
	storage: "local",
	schema: v.object({
		sourceDeviceId: v.fallback(v.string(), DEFAULT_SETTINGS.sourceDeviceId),
		audioSource: v.fallback(
			v.custom<AudioSource>(isAudioSource),
			DEFAULT_SETTINGS.audioSource,
		),
		upload: v.fallback(v.boolean(), DEFAULT_SETTINGS.upload),
		saveClips: v.fallback(v.boolean(), DEFAULT_SETTINGS.saveClips),
		clipMinKills: v.fallback(
			v.picklist(CLIP_MIN_KILLS_OPTIONS),
			DEFAULT_SETTINGS.clipMinKills,
		),
		audioOffsetMs: v.fallback(
			v.pipe(
				v.number(),
				v.finite(),
				v.transform((ms) =>
					Math.max(-AUDIO_OFFSET_LIMIT_MS, Math.min(AUDIO_OFFSET_LIMIT_MS, ms)),
				),
			),
			DEFAULT_SETTINGS.audioOffsetMs,
		),
		webgpu: v.fallback(v.boolean(), DEFAULT_SETTINGS.webgpu),
	}),
	default: DEFAULT_SETTINGS,
});

/** The current settings. */
export function readSettings(): ScannerSettings {
	return PersistedState.read(scannerSettingsPersisted);
}

/** Private mode or a full quota keep the settings for this visit only. */
export function updateSettings(patch: Partial<ScannerSettings>): void {
	PersistedState.write(scannerSettingsPersisted, {
		...readSettings(),
		...patch,
	});
}

export function useScannerSettings(): ScannerSettings {
	return usePersistedState(scannerSettingsPersisted)[0];
}

/** The `deviceId` a `device:<id>` audio source names; null for the other kinds. */
export function audioDeviceIdOf(source: AudioSource): string | null {
	return source.startsWith("device:") ? source.slice("device:".length) : null;
}

function isAudioSource(value: unknown): value is AudioSource {
	return (
		value === "source" ||
		value === "desktop" ||
		value === "off" ||
		(typeof value === "string" && value.startsWith("device:"))
	);
}
