import * as R from "remeda";

const MENTION_TOKEN_REGEX = /<mention-(\d+)>/g;
const MAX_MENTION_SUGGESTIONS = 6;
const WORD_CHARACTER_REGEX = /[\p{L}\p{N}_]/u;
const MENTION_QUERY_REGEX = /(?:^|[^\p{L}\p{N}_])@([^\s@]*)$/u;

type MessagePart =
	| { type: "text"; text: string }
	| { type: "mention"; userId: number };

export interface PickedMention {
	userId: number;
	username: string;
	start: number;
}

export function token(userId: number) {
	return `<mention-${userId}>`;
}

export function split(contents: string): MessagePart[] {
	const parts: MessagePart[] = [];
	let lastIndex = 0;

	for (const match of contents.matchAll(MENTION_TOKEN_REGEX)) {
		if (match.index > lastIndex) {
			parts.push({
				type: "text",
				text: contents.slice(lastIndex, match.index),
			});
		}
		parts.push({ type: "mention", userId: Number(match[1]) });
		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < contents.length) {
		parts.push({ type: "text", text: contents.slice(lastIndex) });
	}

	return parts;
}

export function mentionedUserIds(contents: string) {
	return R.unique(
		Array.from(contents.matchAll(MENTION_TOKEN_REGEX), (match) =>
			Number(match[1]),
		),
	);
}

export function mentionsUser(contents: string, userId: number) {
	return contents.includes(token(userId));
}

export function visibleLength(contents: string) {
	return contents.replace(MENTION_TOKEN_REGEX, "@").length;
}

export function encode(
	text: string,
	users: Array<{ id: number; username: string }>,
	pickedMentions: PickedMention[] = [],
) {
	const longestNameFirst = users.toSorted(
		(a, b) => b.username.length - a.username.length,
	);

	let result = "";
	let index = 0;
	while (index < text.length) {
		const atIndex = text.indexOf("@", index);
		if (atIndex === -1) break;

		result += text.slice(index, atIndex);
		const mention = isWordCharacter(text[atIndex - 1])
			? undefined
			: mentionAt(text, atIndex, longestNameFirst, pickedMentions);

		if (mention) {
			result += token(mention.userId);
			index = atIndex + 1 + mention.username.length;
		} else {
			result += "@";
			index = atIndex + 1;
		}
	}

	return result + text.slice(index);
}

export function shiftPicked(
	pickedMentions: PickedMention[],
	previousText: string,
	nextText: string,
): PickedMention[] {
	const maxCommon = Math.min(previousText.length, nextText.length);
	let prefix = 0;
	while (prefix < maxCommon && previousText[prefix] === nextText[prefix]) {
		prefix++;
	}
	let suffix = 0;
	while (
		suffix < maxCommon - prefix &&
		previousText[previousText.length - 1 - suffix] ===
			nextText[nextText.length - 1 - suffix]
	) {
		suffix++;
	}

	const editedEnd = previousText.length - suffix;
	const shift = nextText.length - previousText.length;

	return pickedMentions.flatMap((mention) => {
		const end = mention.start + 1 + mention.username.length;
		if (end <= prefix) return [mention];
		if (mention.start >= editedEnd) {
			return [{ ...mention, start: mention.start + shift }];
		}
		return [];
	});
}

export function activeQuery(text: string, caret: number) {
	const match = MENTION_QUERY_REGEX.exec(text.slice(0, caret));
	if (!match) return null;

	return { query: match[1], start: caret - match[1].length - 1 };
}

export function suggestions<T extends { username: string }>(
	users: T[],
	query: string,
) {
	const normalizedQuery = query.toLowerCase();
	const matching = users.filter((user) =>
		user.username.toLowerCase().includes(normalizedQuery),
	);
	const [startingWith, containing] = R.partition(matching, (user) =>
		user.username.toLowerCase().startsWith(normalizedQuery),
	);

	return [...startingWith, ...containing].slice(0, MAX_MENTION_SUGGESTIONS);
}

function mentionAt(
	text: string,
	atIndex: number,
	longestNameFirst: Array<{ id: number; username: string }>,
	pickedMentions: PickedMention[],
) {
	const picked = pickedMentions.find(
		(mention) =>
			mention.start === atIndex && namedAt(text, atIndex + 1, mention.username),
	);
	if (picked) return picked;

	const user = longestNameFirst.find((candidate) =>
		namedAt(text, atIndex + 1, candidate.username),
	);
	return user ? { userId: user.id, username: user.username } : undefined;
}

function namedAt(text: string, index: number, username: string) {
	const end = index + username.length;
	return (
		username.length > 0 &&
		text.slice(index, end).toLowerCase() === username.toLowerCase() &&
		!isWordCharacter(text[end])
	);
}

function isWordCharacter(character: string | undefined) {
	return character !== undefined && WORD_CHARACTER_REGEX.test(character);
}
