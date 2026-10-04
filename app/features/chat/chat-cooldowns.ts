export const MENTION_COOLDOWN_MS = 5_000;
export const STICKER_COOLDOWN_MS = 15_000;
export const STICKER_COOLDOWN_KEY = "sticker";

const cooldownUntilByKey = new Map<string, number>();

export function mentionCooldownKey(userId: number) {
	return `mention:${userId}`;
}

export function startCooldowns(
	keys: string[],
	durationMs: number,
	now = Date.now(),
) {
	for (const key of keys) {
		cooldownUntilByKey.set(key, now + durationMs);
	}
}

export function cooldownUntil(key: string, now = Date.now()) {
	const until = cooldownUntilByKey.get(key);

	return until !== undefined && until > now ? until : null;
}
