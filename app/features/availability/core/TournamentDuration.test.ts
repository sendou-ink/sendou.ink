import { describe, expect, test } from "vitest";
import type { Tables } from "~/db/tables";
import * as TournamentDuration from "./TournamentDuration";

const HOUR = 60 * 60;

const DOUBLE_ELIMINATION: Array<Tables["TournamentStage"]["type"]> = [
	"double_elimination",
];
const GROUPS_TO_TOP_CUT: Array<Tables["TournamentStage"]["type"]> = [
	"round_robin",
	"single_elimination",
];

describe("TournamentDuration.estimateSeconds", () => {
	test.each([
		{
			why: "regular 4v4",
			minMembersPerTeam: 4,
			bracketTypes: DOUBLE_ELIMINATION,
			teamCount: 16,
			expected: 4 * HOUR,
		},
		{
			why: "large 4v4",
			minMembersPerTeam: 4,
			bracketTypes: GROUPS_TO_TOP_CUT,
			teamCount: 32,
			expected: 4.5 * HOUR,
		},
		{
			why: "single elimination only is the short outlier",
			minMembersPerTeam: 4,
			bracketTypes: ["single_elimination"] as const,
			teamCount: 16,
			expected: 2 * HOUR,
		},
		{
			why: "single elimination feeding from groups is not the outlier",
			minMembersPerTeam: 4,
			bracketTypes: GROUPS_TO_TOP_CUT,
			teamCount: 16,
			expected: 4 * HOUR,
		},
		{
			why: "1v1",
			minMembersPerTeam: 1,
			bracketTypes: DOUBLE_ELIMINATION,
			teamCount: 16,
			expected: 2.5 * HOUR,
		},
		{
			why: "2v2",
			minMembersPerTeam: 2,
			bracketTypes: DOUBLE_ELIMINATION,
			teamCount: 16,
			expected: 2.5 * HOUR,
		},
		{
			why: "3v3 stays small-sized regardless of team count",
			minMembersPerTeam: 3,
			bracketTypes: DOUBLE_ELIMINATION,
			teamCount: 64,
			expected: 2.5 * HOUR,
		},
		{
			why: "small-sized single elimination only",
			minMembersPerTeam: 1,
			bracketTypes: ["single_elimination"] as const,
			teamCount: 8,
			expected: 2 * HOUR,
		},
	])(
		"returns $expected seconds for $why",
		({ minMembersPerTeam, bracketTypes, teamCount, expected }) => {
			expect(
				TournamentDuration.estimateSeconds({
					minMembersPerTeam,
					bracketTypes: [...bracketTypes],
					teamCount,
				}),
			).toBe(expected);
		},
	);

	test("no estimate exceeds MAX_ESTIMATE_SECONDS", () => {
		for (const minMembersPerTeam of [1, 2, 3, 4]) {
			for (const bracketTypes of [
				DOUBLE_ELIMINATION,
				GROUPS_TO_TOP_CUT,
				["single_elimination" as const],
			]) {
				for (const teamCount of [4, 16, 32, 100]) {
					expect(
						TournamentDuration.estimateSeconds({
							minMembersPerTeam,
							bracketTypes,
							teamCount,
						}),
					).toBeLessThanOrEqual(TournamentDuration.MAX_ESTIMATE_SECONDS);
				}
			}
		}
	});
});
