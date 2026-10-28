import { describe, expect, test } from "bun:test";
import * as TournamentLFG from "./TournamentLFG";

const OUR_ID = 1;
const THEIR_ID = 2;

describe("TournamentLFG.canPutTeamInQueue", () => {
	test.each<{
		role: Parameters<typeof TournamentLFG.canPutTeamInQueue>[0];
		expected: boolean;
	}>([
		{ role: "OWNER", expected: true },
		{ role: "MANAGER", expected: true },
		{ role: "REGULAR", expected: false },
		{ role: null, expected: false },
	])("$role → $expected", ({ role, expected }) => {
		expect(TournamentLFG.canPutTeamInQueue(role)).toBe(expected);
	});
});

describe("TournamentLFG.survivingTeamId", () => {
	test.each([
		{
			why: "registered team over our placeholder",
			ourIsPlaceholder: true,
			theirIsPlaceholder: false,
			expected: THEIR_ID,
		},
		{
			why: "our registered team over their placeholder",
			ourIsPlaceholder: false,
			theirIsPlaceholder: true,
			expected: OUR_ID,
		},
		{
			why: "ours when both are placeholders",
			ourIsPlaceholder: true,
			theirIsPlaceholder: true,
			expected: OUR_ID,
		},
		{
			why: "ours when both are registered teams",
			ourIsPlaceholder: false,
			theirIsPlaceholder: false,
			expected: OUR_ID,
		},
	])("$why", ({ ourIsPlaceholder, theirIsPlaceholder, expected }) => {
		expect(
			TournamentLFG.survivingTeamId({
				ourGroup: { id: OUR_ID, isPlaceholder: ourIsPlaceholder },
				theirGroup: { id: THEIR_ID, isPlaceholder: theirIsPlaceholder },
			}),
		).toBe(expected);
	});
});

describe("TournamentLFG.pickupChatRoomExpiresAt", () => {
	test("expires a week after the tournament starts", () => {
		expect(
			TournamentLFG.pickupChatRoomExpiresAt(new Date("2026-10-01T18:00:00Z")),
		).toEqual(new Date("2026-10-08T18:00:00Z"));
	});
});
