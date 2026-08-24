import { logger } from "~/utils/logger";
import { soundPath } from "~/utils/urls";
import type { SystemMessageType } from "./chat-types";

export function messageTypeToSound(type: SystemMessageType | undefined) {
	if (type === "LIKE_RECEIVED") return "sq_like";
	if (type === "MATCH_STARTED") return "sq_match";
	if (type === "READY_CHECK_STARTED") return "sq_ready-check";
	if (type === "NEW_GROUP") return "sq_new-group";

	return null;
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
