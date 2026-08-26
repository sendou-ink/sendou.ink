import { logger } from "~/utils/logger";
import { soundPath } from "~/utils/urls";
import { SOUND_BY_SYSTEM_MESSAGE_TYPE } from "./chat-constants";
import type {
	SoundOnlySystemMessageType,
	SystemMessageType,
} from "./chat-types";

export function messageTypeToSound(type: SystemMessageType | undefined) {
	const soundOnly = soundOnlyType(type);

	return soundOnly ? SOUND_BY_SYSTEM_MESSAGE_TYPE[soundOnly] : null;
}

/** The type if its broadcast plays a sound, otherwise undefined. */
export function soundOnlyType(
	type: SystemMessageType | undefined,
): SoundOnlySystemMessageType | undefined {
	return type && playsSound(type) ? type : undefined;
}

export function soundCodeToLocalStorageKey(soundCode: string) {
	return `settings__sound-enabled__${soundCode}`;
}

export function soundEnabled(soundCode: string) {
	const localStorageKey = soundCodeToLocalStorageKey(soundCode);
	const soundEnabled = localStorage.getItem(localStorageKey);

	return !soundEnabled || soundEnabled === "true";
}

export function playMessageSound(type: SystemMessageType | undefined) {
	const sound = messageTypeToSound(type);
	if (!sound || !soundEnabled(sound)) return;

	const audio = new Audio(soundPath(sound));
	audio.volume = soundVolume() / 100;
	void audio.play().catch((err) => logger.error(`Couldn't play sound: ${err}`));
}

export function soundVolume() {
	const volume = localStorage.getItem("settings__sound-volume");

	return volume ? Number.parseFloat(volume) : 100;
}

function playsSound(
	type: SystemMessageType,
): type is SoundOnlySystemMessageType {
	return type in SOUND_BY_SYSTEM_MESSAGE_TYPE;
}
