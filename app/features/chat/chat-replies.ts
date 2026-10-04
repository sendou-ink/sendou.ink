const REPLY_TOKEN_REGEX = /<reply-(\d+)>/g;

export function replyToken(messageId: number) {
	return `<reply-${messageId}>`;
}

export function messageReply(contents: string) {
	const [match] = contents.matchAll(REPLY_TOKEN_REGEX);

	return {
		rest: contents.replace(REPLY_TOKEN_REGEX, "").trim(),
		replyToMessageId: match ? Number(match[1]) : null,
	};
}

export function hasValidReplies(contents: string) {
	return Array.from(contents.matchAll(REPLY_TOKEN_REGEX)).length <= 1;
}
