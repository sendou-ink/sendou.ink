import { describe, expect, test } from "vitest";
import { SCHEDULE_VISIBILITY_FRIENDS_VALUE } from "../availability-constants";
import * as ScheduleVisibility from "./ScheduleVisibility";

const TEAMS = [
	{ id: 1, name: "Team Olive" },
	{ id: 2, name: "Alliance Rogue" },
];

describe("ScheduleVisibility.sharesWith", () => {
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
		expect(ScheduleVisibility.sharesWith(args)).toBe(expected);
	});
});

describe("ScheduleVisibility.hiddenFrom", () => {
	test("hides nothing while the schedule is shared with everyone", () => {
		expect(
			ScheduleVisibility.hiddenFrom({ visibility: undefined, teams: TEAMS }),
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
		expect(ScheduleVisibility.hiddenFrom({ visibility, teams: TEAMS })).toEqual(
			expected,
		);
	});

	test("counts a team joined after the visibility was saved as hidden", () => {
		expect(
			ScheduleVisibility.hiddenFrom({
				visibility: { friends: true, teamIds: [1] },
				teams: [...TEAMS, { id: 3, name: "Team Blue" }],
			}).teams,
		).toEqual([TEAMS[1], { id: 3, name: "Team Blue" }]);
	});
});

describe("ScheduleVisibility.fromSelection", () => {
	const friends = SCHEDULE_VISIBILITY_FRIENDS_VALUE;

	test.each([
		{
			why: "friends and every team stays on the default",
			sharedWith: [friends, "1", "2"],
			teams: TEAMS,
			expected: undefined,
		},
		{
			why: "friends and some of the teams",
			sharedWith: [friends, "1"],
			teams: TEAMS,
			expected: { friends: true, teamIds: [1] },
		},
		{
			why: "every team but not friends",
			sharedWith: ["1", "2"],
			teams: TEAMS,
			expected: { friends: false, teamIds: [1, 2] },
		},
		{
			why: "nothing",
			sharedWith: [],
			teams: TEAMS,
			expected: { friends: false, teamIds: [] },
		},
		{
			why: "friends without any teams is friends only",
			sharedWith: [friends],
			teams: [],
			expected: { friends: true, teamIds: [] },
		},
		{
			why: "a team the user is not a member of is dropped",
			sharedWith: [friends, "1", "3"],
			teams: TEAMS,
			expected: { friends: true, teamIds: [1] },
		},
	])("$why", ({ sharedWith, teams, expected }) => {
		expect(ScheduleVisibility.fromSelection({ sharedWith, teams })).toEqual(
			expected,
		);
	});
});
