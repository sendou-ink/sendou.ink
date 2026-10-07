export const MENTION_COOLDOWN_MS = 5_000;
export const STICKER_COOLDOWN_MS = 15_000;
export const STICKER_COOLDOWN_KEY = "sticker";

const STORAGE_KEY = "chat__cooldowns";
const fallbackCooldowns = new Map<string, number>();

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
	let stored: unknown;
	try {
		stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
	} catch {
		stored = Object.fromEntries(fallbackCooldowns);
	}

	if (typeof stored !== "object" || stored === null) return new Map();

	return new Map(
		Object.entries(stored).filter(
			(entry): entry is [string, number] =>
				typeof entry[1] === "number" && entry[1] > now,
		),
	);
}

function saveCooldowns(cooldowns: Map<string, number>) {
	try {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify(Object.fromEntries(cooldowns)),
		);
	} catch {
		fallbackCooldowns.clear();
		for (const [key, endsAt] of cooldowns) {
			fallbackCooldowns.set(key, endsAt);
		}
	}
}
