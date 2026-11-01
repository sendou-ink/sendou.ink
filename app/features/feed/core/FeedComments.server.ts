import type {
	ChatMessageAuthor,
	ChatMessageWithAuthor,
} from "~/features/chat/chat-types";
import { FEED_MOCK_COMMENTS, type FeedItemType } from "../feed-constants";
import type { FeedItem } from "./FeedItems.server";

const MOCK_COMMENT_INTERVAL_SECONDS = 17 * 60;

const addedCommentsByKey = new Map<string, ChatMessageWithAuthor[]>();

/** The comments of the viewer's post: mocked ones written by their friends followed by ones added since the server started. */
export function forItem({
	item,
	viewerId,
	friends,
	now,
}: {
	item: FeedItem;
	viewerId: number;
	friends: ChatMessageAuthor[];
	now: number;
}): ChatMessageWithAuthor[] {
	const texts = friends.length > 0 ? (FEED_MOCK_COMMENTS[item.type] ?? []) : [];

	const mocked = texts.map((contents, i): ChatMessageWithAuthor => {
		const author = friends[(item.at + i) % friends.length];

		return {
			id: i + 1,
			roomId: 0,
			authorUserId: author.id,
			type: null,
			contents,
			publicId: `mock-${item.type}-${i}`,
			createdAt: Math.min(
				item.at + (i + 1) * MOCK_COMMENT_INTERVAL_SECONDS,
				now - (texts.length - i) * 60,
			),
			author,
		};
	});

	return [
		...mocked,
		...(addedCommentsByKey.get(key(item.type, viewerId)) ?? []),
	];
}

/** How many comments `forItem` returns for the post. */
export function count({
	type,
	viewerId,
	hasFriends,
}: {
	type: FeedItemType;
	viewerId: number;
	hasFriends: boolean;
}) {
	return (
		(hasFriends ? (FEED_MOCK_COMMENTS[type]?.length ?? 0) : 0) +
		(addedCommentsByKey.get(key(type, viewerId))?.length ?? 0)
	);
}

/** Adds a comment to the viewer's post, kept in memory until the server restarts. */
export function add({
	type,
	viewerId,
	author,
	publicId,
	contents,
	now,
}: {
	type: FeedItemType;
	viewerId: number;
	author: ChatMessageAuthor;
	publicId: string;
	contents: string;
	now: number;
}) {
	const added = addedCommentsByKey.get(key(type, viewerId)) ?? [];
	if (added.some((comment) => comment.publicId === publicId)) return;

	added.push({
		id: (FEED_MOCK_COMMENTS[type]?.length ?? 0) + added.length + 1,
		roomId: 0,
		authorUserId: author.id,
		type: null,
		contents,
		publicId,
		createdAt: now,
		author,
	});
	addedCommentsByKey.set(key(type, viewerId), added);
}

function key(type: FeedItemType, viewerId: number) {
	return `${viewerId}-${type}`;
}
