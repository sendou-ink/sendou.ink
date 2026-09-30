import { describe, expect, test } from "vitest";
import {
	scheduleAudiencesHiddenFrom,
	sharesScheduleWith,
} from "./availability-utils";

const TEAMS = [
	{ id: 1, name: "Team Olive" },
	{ id: 2, name: "Alliance Rogue" },
];

describe("sharesScheduleWith", () => {
	test.each([
		{
			why: "no preference set",
			visibility: undefined,
			isFriend: false,
			sharedTeamIds: [],
			expected: true,
		},
		{
			why: "a friend while sharing with friends",
			visibility: { friends: true, teamIds: [] },
			isFriend: true,
			sharedTeamIds: [],
			expected: true,
		},
		{
			why: "a friend while not sharing with friends",
			visibility: { friends: false, teamIds: [] },
			isFriend: true,
			sharedTeamIds: [],
			expected: false,
		},
		{
			why: "a stranger while sharing with friends",
			visibility: { friends: true, teamIds: [] },
			isFriend: false,
			sharedTeamIds: [],
			expected: false,
		},
		{
			why: "one of the shared teams in common",
			visibility: { friends: false, teamIds: [1, 2] },
			isFriend: false,
			sharedTeamIds: [2],
			expected: true,
		},
		{
			why: "only a team left out in common",
			visibility: { friends: false, teamIds: [1] },
			isFriend: false,
			sharedTeamIds: [2],
			expected: false,
		},
	])("$why", ({ expected, ...args }) => {
		expect(sharesScheduleWith(args)).toBe(expected);
	});
});

describe("scheduleAudiencesHiddenFrom", () => {
	test("hides nothing while the schedule is shared with everyone", () => {
		expect(
			scheduleAudiencesHiddenFrom({ visibility: undefined, teams: TEAMS }),
		).toEqual({ friends: false, teams: [] });
	});

	test.each([
		{
			why: "friends left out",
			visibility: { friends: false, teamIds: [1, 2] },
			expected: { friends: true, teams: [] },
		},
		{
			why: "one team left out",
			visibility: { friends: true, teamIds: [1] },
			expected: { friends: false, teams: [TEAMS[1]] },
		},
		{
			why: "nobody shared with",
			visibility: { friends: false, teamIds: [] },
			expected: { friends: true, teams: TEAMS },
		},
	])("names who is hidden with $why", ({ visibility, expected }) => {
		expect(scheduleAudiencesHiddenFrom({ visibility, teams: TEAMS })).toEqual(
			expected,
		);
	});

	test("counts a team joined after the visibility was saved as hidden", () => {
		expect(
			scheduleAudiencesHiddenFrom({
				visibility: { friends: true, teamIds: [1] },
				teams: [...TEAMS, { id: 3, name: "Team Blue" }],
			}).teams,
		).toEqual([TEAMS[1], { id: 3, name: "Team Blue" }]);
	});
});
