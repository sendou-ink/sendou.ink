import { describe, expect, test } from "vitest";
import type { ClientChatMessage } from "../chat-types";
import * as LogLayout from "./LogLayout";

const message = (
	overrides: Partial<ClientChatMessage> = {},
): ClientChatMessage => ({
	id: 1,
	roomId: 1,
	authorUserId: 1,
	type: null,
	contents: "hello",
	publicId: "public-1",
	createdAt: 1_700_000_000,
	author: null,
	...overrides,
});

describe("LogLayout.continuesBatch", () => {
	test.each([
		{
			why: "the same author right after continues",
			previous: message(),
			next: message({ createdAt: 1_700_000_060 }),
			expected: true,
		},
		{
			why: "the same author exactly three minutes after continues",
			previous: message(),
			next: message({ createdAt: 1_700_000_180 }),
			expected: true,
		},
		{
			why: "the same author over three minutes after starts a new batch",
			previous: message(),
			next: message({ createdAt: 1_700_000_181 }),
			expected: false,
		},
		{
			why: "another author starts a new batch",
			previous: message(),
			next: message({ authorUserId: 2 }),
			expected: false,
		},
		{
			why: "a message after a system message starts a new batch",
			previous: message({ type: "SCORE_REPORTED" }),
			next: message(),
			expected: false,
		},
		{
			why: "a system message never continues a batch",
			previous: message(),
			next: message({ type: "SCORE_REPORTED" }),
			expected: false,
		},
		{
			why: "a reply starts a new batch",
			previous: message(),
			next: message({ contents: "<reply-1> yes" }),
			expected: false,
		},
		{
			why: "the first message starts a batch",
			previous: undefined,
			next: message(),
			expected: false,
		},
	])("$why", ({ previous, next, expected }) => {
		expect(LogLayout.continuesBatch(previous, next)).toBe(expected);
	});
});

const OWN_USER_ID = 1;
const OTHER_USER_ID = 2;

const messageWithId = (
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

describe("LogLayout.firstUnreadMessageId", () => {
	test.each([
		{
			why: "the oldest of the unread messages",
			messages: [
				messageWithId(1),
				messageWithId(2),
				messageWithId(3),
				messageWithId(4),
			],
			divider: { unreadCount: 2, upToMessageId: 4 },
			expected: 3,
		},
		{
			why: "messages arriving after the room came into view don't move it",
			messages: [
				messageWithId(1),
				messageWithId(2),
				messageWithId(3),
				messageWithId(4),
				messageWithId(5),
			],
			divider: { unreadCount: 2, upToMessageId: 3 },
			expected: 2,
		},
		{
			why: "own messages are never unread",
			messages: [
				messageWithId(1),
				messageWithId(2),
				messageWithId(3, OWN_USER_ID),
				messageWithId(4),
			],
			divider: { unreadCount: 2, upToMessageId: 4 },
			expected: 2,
		},
		{
			why: "system messages count as unread",
			messages: [messageWithId(1), messageWithId(2), messageWithId(3, null)],
			divider: { unreadCount: 1, upToMessageId: 3 },
			expected: 3,
		},
		{
			why: "pending sends are skipped",
			messages: [
				messageWithId(1),
				messageWithId(2),
				messageWithId(3, OTHER_USER_ID, true),
			],
			divider: { unreadCount: 1, upToMessageId: 3 },
			expected: 2,
		},
		{
			why: "more unread than loaded marks the oldest loaded",
			messages: [messageWithId(5), messageWithId(6)],
			divider: { unreadCount: 10, upToMessageId: 6 },
			expected: 5,
		},
		{
			why: "no divider",
			messages: [messageWithId(1)],
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
			LogLayout.firstUnreadMessageId({
				messages,
				divider,
				ownUserId: OWN_USER_ID,
			}),
		).toBe(expected);
	});
});
