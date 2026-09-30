import { describe, expect, test } from "vitest";
import type { UserCardData } from "./user-card-types";
import { privateNoteSentimentScore } from "./user-card-utils";

const cardWithSentiment = (sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE") =>
	({
		privateNote: { text: "", sentiment, updatedAt: 0 },
	}) as unknown as UserCardData;

const userCards = new Map<number, UserCardData>([
	[1, cardWithSentiment("POSITIVE")],
	[2, cardWithSentiment("NEGATIVE")],
	[3, cardWithSentiment("NEUTRAL")],
]);

describe("privateNoteSentimentScore", () => {
	test.each([
		{ why: "no notes", memberIds: [4, 5], expected: 0 },
		{ why: "neutral note", memberIds: [3], expected: 0 },
		{ why: "positive note", memberIds: [1, 4], expected: 1 },
		{ why: "negative note", memberIds: [2, 4], expected: -1 },
		{ why: "negative outweighs positive", memberIds: [1, 2], expected: -1 },
	])("$why", ({ memberIds, expected }) => {
		expect(
			privateNoteSentimentScore(
				memberIds.map((id) => ({ id })),
				userCards,
			),
		).toBe(expected);
	});
});
