export const MENTION_COOLDOWN_MS = 5_000;
export const STICKER_COOLDOWN_MS = 15_000;
export const STICKER_COOLDOWN_KEY = "sticker";

const cooldownUntilByKey = new Map<string, number>();

export function mentionKey(userId: number) {
	return `mention:${userId}`;
}

export function start(keys: string[], durationMs: number, now = Date.now()) {
	for (const key of keys) {
		cooldownUntilByKey.set(key, now + durationMs);
	}
}

export function until(key: string, now = Date.now()) {
	const endsAt = cooldownUntilByKey.get(key);

	return endsAt !== undefined && endsAt > now ? endsAt : null;
}
