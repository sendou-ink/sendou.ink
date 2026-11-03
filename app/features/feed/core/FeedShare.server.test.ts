import { describe, expect, test } from "vitest";
import * as FeedShare from "./FeedShare.server";

const ITEM_ID = "TO_WIN-1700000000-abc123";
const SHARER_ID = 1;

describe("FeedShare.isValid", () => {
	test("accepts the token made for the post and sharer", () => {
		const token = FeedShare.token({ itemId: ITEM_ID, sharerId: SHARER_ID });

		expect(
			FeedShare.isValid({ itemId: ITEM_ID, sharerId: SHARER_ID, token }),
		).toBe(true);
	});

	const validToken = FeedShare.token({ itemId: ITEM_ID, sharerId: SHARER_ID });

	test.each([
		{
			why: "tampered token",
			itemId: ITEM_ID,
			sharerId: SHARER_ID,
			token: `${validToken.slice(0, -1)}${validToken.endsWith("A") ? "B" : "A"}`,
		},
		{
			why: "another post",
			itemId: "TO_WIN-1700000000-def456",
			sharerId: SHARER_ID,
			token: validToken,
		},
		{
			why: "another sharer",
			itemId: ITEM_ID,
			sharerId: SHARER_ID + 1,
			token: validToken,
		},
		{
			why: "too short",
			itemId: ITEM_ID,
			sharerId: SHARER_ID,
			token: validToken.slice(0, -1),
		},
		{
			why: "too long",
			itemId: ITEM_ID,
			sharerId: SHARER_ID,
			token: `${validToken}A`,
		},
		{ why: "empty", itemId: ITEM_ID, sharerId: SHARER_ID, token: "" },
	])("rejects a token for $why", ({ itemId, sharerId, token }) => {
		expect(FeedShare.isValid({ itemId, sharerId, token })).toBe(false);
	});
});
