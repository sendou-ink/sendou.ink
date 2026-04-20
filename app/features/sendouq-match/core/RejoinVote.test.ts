import { describe, expect, test } from "vitest";
import type { SQMatch } from "~/features/sendouq/core/SendouQ.server";
import * as RejoinVote from "./RejoinVote";

type MatchInput = Pick<SQMatch, "groupAlpha" | "groupBravo">;

function groupWith(
	members: Array<{ id: number; isContinuing: boolean | null }>,
) {
	return { members } as unknown as MatchInput["groupAlpha"];
}

describe("RejoinVote.result()", () => {
	test("is ONGOING until the whole group has voted", () => {
		expect(
			RejoinVote.result([
				{ userId: 1, isContinuing: true },
				{ userId: 2, isContinuing: true },
				{ userId: 3, isContinuing: true },
			]),
		).toEqual({ type: "ONGOING" });
	});

	test("resolves with the ids of members who chose to continue", () => {
		const result = RejoinVote.result([
			{ userId: 1, isContinuing: true },
			{ userId: 2, isContinuing: false },
			{ userId: 3, isContinuing: true },
			{ userId: 4, isContinuing: false },
		]);

		expect(result).toEqual({
			type: "RESOLVED",
			continuingUserIds: [1, 3],
		});
	});
});

describe("RejoinVote.userContinueStatus()", () => {
	test("returns null when the user has not voted", () => {
		expect(RejoinVote.userContinueStatus([], 1)).toBeNull();
	});

	test("returns the user's vote", () => {
		const votes = [
			{ userId: 1, isContinuing: false },
			{ userId: 2, isContinuing: true },
		];

		expect(RejoinVote.userContinueStatus(votes, 2)).toBe(true);
		expect(RejoinVote.userContinueStatus(votes, 1)).toBe(false);
	});
});

describe("RejoinVote.canCastVote()", () => {
	test("is true when the user has not voted yet", () => {
		expect(RejoinVote.canCastVote([{ userId: 2, isContinuing: true }], 1)).toBe(
			true,
		);
	});

	test("is false once the user has voted", () => {
		expect(
			RejoinVote.canCastVote([{ userId: 1, isContinuing: false }], 1),
		).toBe(false);
	});
});

describe("RejoinVote.extractOwnGroupVotesFromSendouqMatch()", () => {
	const match = {
		groupAlpha: groupWith([
			{ id: 1, isContinuing: true },
			{ id: 2, isContinuing: null },
			{ id: 3, isContinuing: false },
		]),
		groupBravo: groupWith([{ id: 10, isContinuing: true }]),
	} satisfies MatchInput;

	test("returns only the cast votes of the user's own group", () => {
		expect(RejoinVote.extractOwnGroupVotesFromSendouqMatch(match, 1)).toEqual([
			{ userId: 1, isContinuing: true },
			{ userId: 3, isContinuing: false },
		]);
	});

	test("returns null when the user is in neither group", () => {
		expect(
			RejoinVote.extractOwnGroupVotesFromSendouqMatch(match, 999),
		).toBeNull();
	});
});

describe("RejoinVote.currentUserIds()", () => {
	test("filters out members who voted against continuing", () => {
		const result = RejoinVote.currentUserIds(
			[
				{ userId: 1, isContinuing: true },
				{ userId: 2, isContinuing: false },
			],
			[1, 2, 3, 4],
		);

		expect(result).toEqual([1, 3, 4]);
	});
});
