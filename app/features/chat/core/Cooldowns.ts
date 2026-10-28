import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { cooldownsPersisted } from "../chat-persisted";

export const MENTION_COOLDOWN_MS = 5_000;
export const STICKER_COOLDOWN_MS = 15_000;
export const STICKER_COOLDOWN_KEY = "sticker";

export function mentionKey(userId: number) {
	return `mention:${userId}`;
}

export function start(keys: string[], durationMs: number, now = Date.now()) {
	const cooldowns = activeCooldowns(now);
	for (const key of keys) {
		cooldowns.set(key, now + durationMs);
	}
	saveCooldowns(cooldowns);
}

export function until(key: string, now = Date.now()) {
	return activeCooldowns(now).get(key) ?? null;
}

function activeCooldowns(now: number) {
	return new Map(
		Object.entries(PersistedState.read(cooldownsPersisted)).filter(
			([, endsAt]) => endsAt > now,
		),
	);
}

function saveCooldowns(cooldowns: Map<string, number>) {
	PersistedState.write(cooldownsPersisted, Object.fromEntries(cooldowns));
}
