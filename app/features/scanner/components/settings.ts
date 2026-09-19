/**
 * The scanner's settings, kept in localStorage: the capture source, whether
 * results upload to sendou.ink and whether live clips are saved. Read through
 * a store so the controllers (outside React) and the views see one value.
 */
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "scanner:settings";

export interface ScannerSettings {
	/** `deviceId` of the video input; empty = the browser's default camera */
	sourceDeviceId: string;
	/** upload results to sendou.ink as games end (needs a login) */
	upload: boolean;
	/** keep the live ring buffer and cut clips of the best moments */
	saveClips: boolean;
	/** splats in a row that make a clip */
	clipMinKills: ClipMinKills;
}

export const CLIP_MIN_KILLS_OPTIONS = [3, 4, 5] as const;
export type ClipMinKills = (typeof CLIP_MIN_KILLS_OPTIONS)[number];

const DEFAULT_SETTINGS: ScannerSettings = {
	sourceDeviceId: "",
	upload: true,
	saveClips: true,
	clipMinKills: 4,
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
		};
	} catch {
		return DEFAULT_SETTINGS;
	}
}
