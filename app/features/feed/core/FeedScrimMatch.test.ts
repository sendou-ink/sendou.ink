import { describe, expect, test } from "vitest";
import * as FeedScrimMatch from "./FeedScrimMatch";

const HOUR = 3600;
/** 2026-11-02 18:00 UTC */
const EVENING = 1_793_642_400;

const profile = {
	usualOpponentIds: new Set([1]),
	hours: new Set([18, 19]),
	div: 5,
} satisfies FeedScrimMatch.ScrimTeamProfile;

const post = {
	teamId: 2,
	hours: [18],
	maxDiv: 4,
	minDiv: 6,
	hasRequested: false,
	isViaAssociation: false,
} satisfies FeedScrimMatch.ScrimPostCandidate;

describe("FeedScrimMatch.teamProfile", () => {
	test("usual opponents need two scrims against them", () => {
		const result = FeedScrimMatch.teamProfile({
			scrims: [
				{ opponentTeamId: 1, startsAt: EVENING },
				{ opponentTeamId: 1, startsAt: EVENING + 24 * HOUR },
				{ opponentTeamId: 2, startsAt: EVENING },
				{ opponentTeamId: null, startsAt: EVENING },
			],
			memberDivs: [],
		});

		expect([...result.usualOpponentIds]).toEqual([1]);
	});

	test("hours are the UTC hours the scrims started at", () => {
		const result = FeedScrimMatch.teamProfile({
			scrims: [
				{ opponentTeamId: null, startsAt: EVENING },
				{ opponentTeamId: null, startsAt: EVENING + 2 * HOUR },
			],
			memberDivs: [],
		});

		expect(result.hours).toEqual(new Set([18, 20]));
	});

	test.each([
		{ why: "median of the members", memberDivs: [0, 4, 9], expected: 4 },
		{ why: "no member with a div", memberDivs: [], expected: null },
	])("div: $why", ({ memberDivs, expected }) => {
		expect(FeedScrimMatch.teamProfile({ scrims: [], memberDivs }).div).toBe(
			expected,
		);
	});
});

describe("FeedScrimMatch.startHours", () => {
	test.each([
		{ why: "a fixed start", rangeEndsAt: null, expected: [18] },
		{
			why: "every hour of the flexibility",
			rangeEndsAt: EVENING + 2 * HOUR,
			expected: [18, 19, 20],
		},
		{
			why: "flexibility under an hour",
			rangeEndsAt: EVENING + HOUR / 2,
			expected: [18],
		},
	])("$why", ({ rangeEndsAt, expected }) => {
		expect(
			FeedScrimMatch.startHours({ startsAt: EVENING, rangeEndsAt }),
		).toEqual(expected);
	});
});

describe("FeedScrimMatch.reasonOf", () => {
	test.each([
		{ why: "fits the division and hours", other: {}, expected: "FIT" },
		{
			why: "requested beats everything",
			other: { teamId: 1, isViaAssociation: true, hasRequested: true },
			expected: "REQUESTED",
		},
		{
			why: "usual opponent beats association",
			other: { teamId: 1, isViaAssociation: true },
			expected: "USUAL_OPPONENT",
		},
		{
			why: "usual opponent outside the division and hours",
			other: { teamId: 1, hours: [3], maxDiv: 0, minDiv: 1 },
			expected: "USUAL_OPPONENT",
		},
		{
			why: "association outside the division and hours",
			other: { isViaAssociation: true, hours: [3], maxDiv: 0, minDiv: 1 },
			expected: "ASSOCIATION",
		},
		{
			why: "one division outside the range",
			other: { maxDiv: 6, minDiv: 8 },
			expected: "FIT",
		},
		{
			why: "two divisions outside the range",
			other: { maxDiv: 0, minDiv: 3 },
			expected: null,
		},
		{ why: "not in a usual hour", other: { hours: [3] }, expected: null },
		{
			why: "no division range fits any team",
			other: { maxDiv: null, minDiv: null },
			expected: "FIT",
		},
	])("$why", ({ other, expected }) => {
		expect(FeedScrimMatch.reasonOf([profile], { ...post, ...other })).toBe(
			expected,
		);
	});

	test("a team without divs only fits posts without a division range", () => {
		const withoutDiv = { ...profile, div: null };

		expect(FeedScrimMatch.reasonOf([withoutDiv], post)).toBeNull();
		expect(
			FeedScrimMatch.reasonOf([withoutDiv], {
				...post,
				maxDiv: null,
				minDiv: null,
			}),
		).toBe("FIT");
	});

	test("any of the viewer's teams can fit", () => {
		const elsewhere = { ...profile, hours: new Set([3]) };

		expect(FeedScrimMatch.reasonOf([elsewhere, profile], post)).toBe("FIT");
	});

	test("nothing is shown without a team", () => {
		expect(
			FeedScrimMatch.reasonOf([], { ...post, hasRequested: true }),
		).toBeNull();
	});
});
