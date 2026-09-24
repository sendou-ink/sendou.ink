/**
 * The scanner's settings, kept in localStorage: the capture source, what
 * clips hear, whether results upload to sendou.ink, whether live clips are
 * saved and whether matching runs on the GPU. Read through a store so the controllers (outside React) and
 * the views see one value.
 */
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "scanner:settings";

export interface ScannerSettings {
	/** `deviceId` of the video input; empty = the browser's default camera */
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

let settings: ScannerSettings | null = null;
const listeners = new Set<() => void>();

/** The current settings (loaded on first access). */
export function readSettings(): ScannerSettings {
	settings ??= load();
	return settings;
}

export function updateSettings(patch: Partial<ScannerSettings>): void {
	settings = { ...readSettings(), ...patch };
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// private mode or a full quota: the in-memory value still applies this visit
	}
	for (const listener of listeners) listener();
}

export function useScannerSettings(): ScannerSettings {
	return useSyncExternalStore(subscribe, readSettings, () => DEFAULT_SETTINGS);
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

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function load(): ScannerSettings {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT_SETTINGS;
		const parsed = JSON.parse(raw) as Partial<ScannerSettings>;
		return {
			sourceDeviceId:
				typeof parsed.sourceDeviceId === "string"
					? parsed.sourceDeviceId
					: DEFAULT_SETTINGS.sourceDeviceId,
			audioSource: isAudioSource(parsed.audioSource)
				? parsed.audioSource
				: DEFAULT_SETTINGS.audioSource,
			upload:
				typeof parsed.upload === "boolean"
					? parsed.upload
					: DEFAULT_SETTINGS.upload,
			saveClips:
				typeof parsed.saveClips === "boolean"
					? parsed.saveClips
					: DEFAULT_SETTINGS.saveClips,
			clipMinKills:
				CLIP_MIN_KILLS_OPTIONS.find((n) => n === parsed.clipMinKills) ??
				DEFAULT_SETTINGS.clipMinKills,
			audioOffsetMs:
				typeof parsed.audioOffsetMs === "number" &&
				Number.isFinite(parsed.audioOffsetMs)
					? Math.max(
							-AUDIO_OFFSET_LIMIT_MS,
							Math.min(AUDIO_OFFSET_LIMIT_MS, parsed.audioOffsetMs),
						)
					: DEFAULT_SETTINGS.audioOffsetMs,
			webgpu:
				typeof parsed.webgpu === "boolean"
					? parsed.webgpu
					: DEFAULT_SETTINGS.webgpu,
		};
	} catch {
		return DEFAULT_SETTINGS;
	}
}
