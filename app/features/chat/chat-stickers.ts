export const CHAT_STICKERS = [
	{ id: "booyah", name: "Booyah" },
	{ id: "despair", name: "Despair" },
	{ id: "flare", name: "Flare" },
	{ id: "i-got-this", name: "I got this" },
	{ id: "like", name: "Like" },
	{ id: "nighty-night", name: "Nighty night" },
	{ id: "no", name: "No" },
	{ id: "ok-1", name: "OK" },
	{ id: "ok-2", name: "OK" },
	{ id: "omw", name: "OMW" },
	{ id: "on-my-way", name: "On my way" },
	{ id: "snipe", name: "Snipe" },
	{ id: "sorry", name: "Sorry" },
	{ id: "stare", name: "Stare" },
	{ id: "stay-fresh", name: "Stay fresh" },
	{ id: "surprise", name: "Surprise" },
	{ id: "thank-you-1", name: "Thank you" },
	{ id: "thank-you-2", name: "Thank you" },
	{ id: "vibe", name: "Vibe" },
	{ id: "what", name: "What" },
	{ id: "where-u-at", name: "Where u at" },
] as const;

export type ChatSticker = (typeof CHAT_STICKERS)[number];

const STICKER_TOKEN_REGEX = /<sticker-([a-z0-9-]+)>/g;
const STICKER_QUERY_REGEX = /(?:^|[^\p{L}\p{N}_])\+([^\s+]*)$/u;

export function stickerToken(stickerId: string) {
	return `<sticker-${stickerId}>`;
}

export function messageSticker(contents: string) {
	return {
		text: contents.replace(STICKER_TOKEN_REGEX, "").trim(),
		sticker: findSticker(stickerIds(contents)[0]),
	};
}

export function hasValidStickers(contents: string) {
	const ids = stickerIds(contents);
	return ids.length <= 1 && ids.every((id) => findSticker(id) !== null);
}

export function activeStickerQuery(text: string, caret: number) {
	const match = STICKER_QUERY_REGEX.exec(text.slice(0, caret));
	if (!match) return null;

	return { query: match[1], start: caret - match[1].length - 1 };
}

export function stickerSuggestions(query: string) {
	const normalizedQuery = query.toLowerCase();
	return CHAT_STICKERS.filter((sticker) =>
		sticker.name.toLowerCase().includes(normalizedQuery),
	);
}

function findSticker(stickerId: string | undefined): ChatSticker | null {
	return CHAT_STICKERS.find((sticker) => sticker.id === stickerId) ?? null;
}

function stickerIds(contents: string) {
	return Array.from(
		contents.matchAll(STICKER_TOKEN_REGEX),
		(match) => match[1],
	);
}
