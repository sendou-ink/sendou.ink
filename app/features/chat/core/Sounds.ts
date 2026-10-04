import { logger } from "~/utils/logger";
import { soundPath } from "~/utils/urls";

export function localStorageKey(soundCode: string) {
	return `settings__sound-enabled__${soundCode}`;
}

export function isEnabled(soundCode: string) {
	const stored = localStorage.getItem(localStorageKey(soundCode));

	return !stored || stored === "true";
}

export function play(soundCode: string) {
	if (!isEnabled(soundCode)) return;

	playIgnoringSetting(soundCode);
}

/** Plays regardless of the user's setting for the sound, for previewing e.g. the volume. */
export function playIgnoringSetting(soundCode: string) {
	const audio = new Audio(soundPath(soundCode));
	audio.volume = volume() / 100;
	void audio.play().catch((err) => logger.error(`Couldn't play sound: ${err}`));
}

export function volume() {
	const stored = localStorage.getItem("settings__sound-volume");

	return stored ? Number.parseFloat(stored) : 100;
}
