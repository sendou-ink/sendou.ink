import { describe, expect, test } from "vitest";
import type { ClientChatMessage } from "./chat-types";
import { firstUnreadMessageId } from "./chat-unread-divider";

const OWN_USER_ID = 1;
const OTHER_USER_ID = 2;

const message = (
	id: number,
	authorUserId: number | null = OTHER_USER_ID,
	pending?: boolean,
): ClientChatMessage => ({
	id,
	roomId: 1,
	authorUserId,
	type: null,
	contents: "hello",
	publicId: `public-${id}`,
	createdAt: 1_700_000_000 + id,
	author: null,
	pending,
});

describe("firstUnreadMessageId", () => {
	test.each([
		{
			why: "the oldest of the unread messages",
			messages: [message(1), message(2), message(3), message(4)],
			divider: { unreadCount: 2, upToMessageId: 4 },
			expected: 3,
		},
		{
			why: "messages arriving after the room came into view don't move it",
			messages: [message(1), message(2), message(3), message(4), message(5)],
			divider: { unreadCount: 2, upToMessageId: 3 },
			expected: 2,
		},
		{
			why: "own messages are never unread",
			messages: [message(1), message(2), message(3, OWN_USER_ID), message(4)],
			divider: { unreadCount: 2, upToMessageId: 4 },
			expected: 2,
		},
		{
			why: "system messages count as unread",
			messages: [message(1), message(2), message(3, null)],
			divider: { unreadCount: 1, upToMessageId: 3 },
			expected: 3,
		},
		{
			why: "pending sends are skipped",
			messages: [message(1), message(2), message(3, OTHER_USER_ID, true)],
			divider: { unreadCount: 1, upToMessageId: 3 },
			expected: 2,
		},
		{
			why: "more unread than loaded marks the oldest loaded",
			messages: [message(5), message(6)],
			divider: { unreadCount: 10, upToMessageId: 6 },
			expected: 5,
		},
		{
			why: "no divider",
			messages: [message(1)],
			divider: undefined,
			expected: null,
		},
		{
			why: "history not loaded yet",
			messages: [],
			divider: { unreadCount: 1, upToMessageId: 1 },
			expected: null,
		},
	])("$why", ({ messages, divider, expected }) => {
		expect(
			firstUnreadMessageId({ messages, divider, ownUserId: OWN_USER_ID }),
		).toBe(expected);
	});
});
