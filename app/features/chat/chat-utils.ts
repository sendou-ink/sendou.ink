import { logger } from "~/utils/logger";
import { soundPath } from "~/utils/urls";

export function soundCodeToLocalStorageKey(soundCode: string) {
	return `settings__sound-enabled__${soundCode}`;
}

export function soundEnabled(soundCode: string) {
	const localStorageKey = soundCodeToLocalStorageKey(soundCode);
	const stored = localStorage.getItem(localStorageKey);

	return !stored || stored === "true";
}

export function playSound(soundCode: string) {
	if (!soundEnabled(soundCode)) return;

	playSoundIgnoringSetting(soundCode);
}

/** Plays regardless of the user's setting for the sound, for previewing e.g. the volume. */
export function playSoundIgnoringSetting(soundCode: string) {
	const audio = new Audio(soundPath(soundCode));
	audio.volume = soundVolume() / 100;
	void audio.play().catch((err) => logger.error(`Couldn't play sound: ${err}`));
}

export function soundVolume() {
	const volume = localStorage.getItem("settings__sound-volume");

	return volume ? Number.parseFloat(volume) : 100;
}
