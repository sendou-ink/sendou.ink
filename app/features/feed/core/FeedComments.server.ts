import type {
	ChatMessageAuthor,
	ChatMessageWithAuthor,
} from "~/features/chat/chat-types";
import * as FeedCommentRepository from "../FeedCommentRepository.server";
import { FEED_MOCK_COMMENTS } from "../feed-constants";
import type { FeedItem, FeedMode } from "./FeedItems.server";

const MOCK_COMMENT_INTERVAL_SECONDS = 17 * 60;

/** The comments of the post, on the test page preceded by mocked ones written by the viewer's friends. */
export async function forItem({
	item,
	mode,
	friends,
	now,
}: {
	item: FeedItem;
	mode: FeedMode;
	friends: ChatMessageAuthor[];
	now: number;
}): Promise<ChatMessageWithAuthor[]> {
	const persisted = await FeedCommentRepository.findByItemId(item.id);
	if (mode !== "TEST") return persisted;

	const texts = friends.length > 0 ? (FEED_MOCK_COMMENTS[item.type] ?? []) : [];
	const mocked = texts.map((contents, i): ChatMessageWithAuthor => {
		const author = friends[(item.at + i) % friends.length];

		return {
			id: -(i + 1),
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

	return [...mocked, ...persisted];
}

/** How many comments each post has, by post id, as `forItem` returns them. */
export async function countByItem({
	items,
	mode,
	hasFriends,
}: {
	items: FeedItem[];
	mode: FeedMode;
	hasFriends: boolean;
}) {
	const persisted = await FeedCommentRepository.countByItemIds(
		items.map((item) => item.id),
	);

	return Object.fromEntries(
		items.map((item) => [
			item.id,
			(persisted[item.id] ?? 0) +
				(mode === "TEST" && hasFriends
					? (FEED_MOCK_COMMENTS[item.type]?.length ?? 0)
					: 0),
		]),
	) as Record<string, number>;
}
