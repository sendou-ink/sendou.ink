const REPLY_TOKEN_REGEX = /<reply-(\d+)>/g;

export function token(messageId: number) {
	return `<reply-${messageId}>`;
}

export function split(contents: string) {
	const [match] = contents.matchAll(REPLY_TOKEN_REGEX);

	return {
		rest: contents.replace(REPLY_TOKEN_REGEX, "").trim(),
		replyToMessageId: match ? Number(match[1]) : null,
	};
}

export function hasValid(contents: string) {
	return Array.from(contents.matchAll(REPLY_TOKEN_REGEX)).length <= 1;
}
