import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import * as Daily from "./Daily.server";

const SECRET = Buffer.from("a webhook secret of some length").toString(
	"base64",
);
const TIMESTAMP = "1728000000";
const BODY = JSON.stringify({ type: "participant.left", payload: {} });

function dailySignature(body: string, timestamp: string) {
	return createHmac("sha256", Buffer.from(SECRET, "base64"))
		.update(`${timestamp}.${body}`)
		.digest("base64");
}

describe("Daily.isValidWebhookSignature", () => {
	test.each([
		{
			why: "a request signed by Daily",
			rawBody: BODY,
			timestamp: TIMESTAMP,
			signature: dailySignature(BODY, TIMESTAMP),
			expected: true,
		},
		{
			why: "a tampered body",
			rawBody: `${BODY} `,
			timestamp: TIMESTAMP,
			signature: dailySignature(BODY, TIMESTAMP),
			expected: false,
		},
		{
			why: "a replayed signature with another timestamp",
			rawBody: BODY,
			timestamp: "1728000001",
			signature: dailySignature(BODY, TIMESTAMP),
			expected: false,
		},
		{
			why: "a missing signature",
			rawBody: BODY,
			timestamp: TIMESTAMP,
			signature: "",
			expected: false,
		},
	])("$why: $expected", ({ rawBody, timestamp, signature, expected }) => {
		expect(
			Daily.isValidWebhookSignature({
				rawBody,
				timestamp,
				signature,
				secret: SECRET,
			}),
		).toBe(expected);
	});
});

describe("Daily.chatRoomIdFromRoomName", () => {
	test("reads back the chat room of its own room names", () => {
		expect(Daily.chatRoomIdFromRoomName(Daily.roomName(42))).toBe(42);
	});

	test.each([
		{ why: "another environment's room", name: "chat-x-42" },
		{ why: "a room named by hand", name: "standup" },
	])("returns null for $why", ({ name }) => {
		expect(Daily.chatRoomIdFromRoomName(name)).toBeNull();
	});
});
