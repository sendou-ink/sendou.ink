import { describe, expect, test } from "vitest";
import { continuesBatch } from "./chat-message-batches";
import type { ClientChatMessage } from "./chat-types";

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

describe("continuesBatch", () => {
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
		expect(continuesBatch(previous, next)).toBe(expected);
	});
});
