import { describe, expect, test } from "vitest";
import * as LeagueScheduling from "./LeagueScheduling";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
/** Monday 2027-01-25 00:00 UTC; any fixed point works. */
const PLAYABLE_AT = 1_800_000_000;

describe("LeagueScheduling.phase", () => {
	const base = {
		hasScheduling: true,
		isOver: false,
		hasBothTeams: true,
		isPlayableAt: PLAYABLE_AT,
		scheduledAt: null,
	};

	test.each([
		{
			why: "no scheduling (not a league or a real-time bracket)",
			args: { ...base, hasScheduling: false, now: PLAYABLE_AT },
			expected: "CLOSED",
		},
		{
			why: "set over",
			args: { ...base, isOver: true, now: PLAYABLE_AT },
			expected: "CLOSED",
		},
		{
			why: "team missing",
			args: { ...base, hasBothTeams: false, now: PLAYABLE_AT },
			expected: "CLOSED",
		},
		{
			why: "more than a day before playable",
			args: { ...base, now: PLAYABLE_AT - DAY - 1 },
			expected: "NOT_OPEN",
		},
		{
			why: "a day before playable",
			args: { ...base, now: PLAYABLE_AT - DAY },
			expected: "UNSCHEDULED",
		},
		{
			why: "playable and no time",
			args: { ...base, now: PLAYABLE_AT + HOUR },
			expected: "UNSCHEDULED",
		},
		{
			why: "no playable time at all",
			args: { ...base, isPlayableAt: null, now: 0 },
			expected: "UNSCHEDULED",
		},
		{
			why: "time agreed before the round is playable",
			args: { ...base, scheduledAt: PLAYABLE_AT + HOUR, now: PLAYABLE_AT - 1 },
			expected: "SCHEDULED_LOCKED",
		},
		{
			why: "time agreed and the round is playable",
			args: { ...base, scheduledAt: PLAYABLE_AT + HOUR, now: PLAYABLE_AT },
			expected: "SCHEDULED",
		},
		{
			why: "time agreed and no playable time",
			args: { ...base, isPlayableAt: null, scheduledAt: PLAYABLE_AT, now: 0 },
			expected: "SCHEDULED",
		},
	])("$why -> $expected", ({ args, expected }) => {
		expect(LeagueScheduling.phase(args)).toBe(expected);
	});
});

describe("LeagueScheduling.opensAt", () => {
	test("a day before the round is playable", () => {
		expect(LeagueScheduling.opensAt(PLAYABLE_AT)).toBe(PLAYABLE_AT - DAY);
	});

	test("right away without a playable time", () => {
		expect(LeagueScheduling.opensAt(null)).toBe(0);
	});
});

describe("LeagueScheduling.playableAtFromDate", () => {
	test("opens at the start of the picked day in UTC+14", () => {
		expect(
			LeagueScheduling.playableAtFromDate(new Date(2027, 0, 25, 18, 30)),
		).toBe(Date.UTC(2027, 0, 24, 10) / 1000);
	});
});

describe("LeagueScheduling.playableDate", () => {
	test("gives back the picked day", () => {
		const picked = new Date(2027, 0, 25);

		expect(
			LeagueScheduling.playableDate(
				LeagueScheduling.playableAtFromDate(picked),
			),
		).toEqual(picked);
	});
});

describe("LeagueScheduling.playableAtsAreAscending", () => {
	test.each([
		{ why: "ascending", playableAts: [DAY, 2 * DAY, 3 * DAY], expected: true },
		{ why: "same day twice", playableAts: [DAY, DAY], expected: true },
		{ why: "descending", playableAts: [2 * DAY, DAY], expected: false },
		{ why: "no times", playableAts: [null, null], expected: true },
		{
			why: "descending past a round without a time",
			playableAts: [2 * DAY, null, DAY],
			expected: false,
		},
	])("$why", ({ playableAts, expected }) => {
		expect(
			LeagueScheduling.playableAtsAreAscending(
				playableAts.map((isPlayableAt) => ({ section: null, isPlayableAt })),
			),
		).toBe(expected);
	});

	test("compares rounds only within their section", () => {
		expect(
			LeagueScheduling.playableAtsAreAscending([
				{ section: "winners", isPlayableAt: 2 * DAY },
				{ section: "losers", isPlayableAt: DAY },
			]),
		).toBe(true);
	});
});

describe("LeagueScheduling.validateProposals", () => {
	const base = {
		phase: "UNSCHEDULED" as const,
		isPlayableAt: PLAYABLE_AT,
		now: PLAYABLE_AT - HOUR,
		existingProposedAts: [],
		setByOrganizer: false,
	};

	test.each([
		{
			why: "valid candidate after playable",
			args: { ...base, proposedAts: [PLAYABLE_AT + HOUR] },
			expected: null,
		},
		{
			why: "candidate exactly at playable",
			args: { ...base, proposedAts: [PLAYABLE_AT] },
			expected: null,
		},
		{
			why: "board closed by the organizer",
			args: { ...base, setByOrganizer: true, proposedAts: [PLAYABLE_AT] },
			expected: "ORGANIZER_LOCKED",
		},
		{
			why: "scheduling not open yet",
			args: { ...base, phase: "NOT_OPEN" as const, proposedAts: [PLAYABLE_AT] },
			expected: "NOT_OPEN",
		},
		{
			why: "set closed",
			args: { ...base, phase: "CLOSED" as const, proposedAts: [PLAYABLE_AT] },
			expected: "NOT_OPEN",
		},
		{
			why: "rescheduling an agreed set",
			args: {
				...base,
				phase: "SCHEDULED" as const,
				proposedAts: [PLAYABLE_AT],
			},
			expected: null,
		},
		{
			why: "candidate before playable",
			args: { ...base, proposedAts: [PLAYABLE_AT - 1] },
			expected: "BEFORE_PLAYABLE",
		},
		{
			why: "candidate in the past without a playable time",
			args: {
				...base,
				isPlayableAt: null,
				now: PLAYABLE_AT,
				proposedAts: [PLAYABLE_AT - 1],
			},
			expected: "IN_PAST",
		},
		{
			why: "one bad candidate spoils the batch",
			args: { ...base, proposedAts: [PLAYABLE_AT + HOUR, PLAYABLE_AT - 1] },
			expected: "BEFORE_PLAYABLE",
		},
		{
			why: "over the cap",
			args: {
				...base,
				proposedAts: Array.from(
					{
						length:
							LeagueScheduling.LEAGUE_SCHEDULING.MAX_OPEN_PROPOSALS_PER_TEAM +
							1,
					},
					(_, i) => PLAYABLE_AT + (i + 1) * HOUR,
				),
			},
			expected: "TOO_MANY",
		},
		{
			why: "exactly at the cap",
			args: {
				...base,
				proposedAts: Array.from(
					{
						length:
							LeagueScheduling.LEAGUE_SCHEDULING.MAX_OPEN_PROPOSALS_PER_TEAM,
					},
					(_, i) => PLAYABLE_AT + (i + 1) * HOUR,
				),
			},
			expected: null,
		},
		{
			why: "keeping a candidate that has since passed",
			args: {
				...base,
				now: PLAYABLE_AT + HOUR,
				existingProposedAts: [PLAYABLE_AT],
				proposedAts: [PLAYABLE_AT, PLAYABLE_AT + 2 * HOUR],
			},
			expected: null,
		},
		{
			why: "clearing every candidate",
			args: { ...base, existingProposedAts: [PLAYABLE_AT], proposedAts: [] },
			expected: null,
		},
	])("$why -> $expected", ({ args, expected }) => {
		expect(LeagueScheduling.validateProposals(args)).toBe(expected);
	});
});

describe("LeagueScheduling.isAcceptableProposal", () => {
	test("a candidate that passed can't be picked", () => {
		expect(
			LeagueScheduling.isAcceptableProposal({
				proposedAt: PLAYABLE_AT,
				now: PLAYABLE_AT,
			}),
		).toBe(false);
		expect(
			LeagueScheduling.isAcceptableProposal({
				proposedAt: PLAYABLE_AT + 1,
				now: PLAYABLE_AT,
			}),
		).toBe(true);
	});
});

describe("LeagueScheduling.isLive", () => {
	const scheduledAt = PLAYABLE_AT + 20 * HOUR;

	test.each([
		{ why: "31 minutes before", now: scheduledAt - 31 * 60, expected: false },
		{ why: "30 minutes before", now: scheduledAt - 30 * 60, expected: true },
		{ why: "at the time", now: scheduledAt, expected: true },
		{ why: "59 minutes after", now: scheduledAt + 59 * 60, expected: true },
		{ why: "an hour after", now: scheduledAt + HOUR, expected: false },
	])("$why -> $expected", ({ now, expected }) => {
		expect(
			LeagueScheduling.isLive({ scheduledAt, hasWinner: false, now }),
		).toBe(expected);
	});

	test("a decided set is not live", () => {
		expect(
			LeagueScheduling.isLive({
				scheduledAt,
				hasWinner: true,
				now: scheduledAt,
			}),
		).toBe(false);
	});
});

describe("LeagueScheduling.availabilityWindow", () => {
	test("from playable to the next round while the round is ahead", () => {
		expect(
			LeagueScheduling.availabilityWindow({
				now: PLAYABLE_AT - HOUR,
				isPlayableAt: PLAYABLE_AT,
				nextIsPlayableAt: PLAYABLE_AT + 7 * DAY,
			}),
		).toEqual({ startsAt: PLAYABLE_AT, endsAt: PLAYABLE_AT + 7 * DAY });
	});

	test("from now once the round is playable", () => {
		expect(
			LeagueScheduling.availabilityWindow({
				now: PLAYABLE_AT + DAY,
				isPlayableAt: PLAYABLE_AT,
				nextIsPlayableAt: PLAYABLE_AT + 7 * DAY,
			}),
		).toEqual({ startsAt: PLAYABLE_AT + DAY, endsAt: PLAYABLE_AT + 7 * DAY });
	});

	test("a week without a next round", () => {
		expect(
			LeagueScheduling.availabilityWindow({
				now: PLAYABLE_AT,
				isPlayableAt: PLAYABLE_AT,
				nextIsPlayableAt: null,
			}),
		).toEqual({ startsAt: PLAYABLE_AT, endsAt: PLAYABLE_AT + 7 * DAY });
	});

	test("a week when the next round already opened", () => {
		expect(
			LeagueScheduling.availabilityWindow({
				now: PLAYABLE_AT + 8 * DAY,
				isPlayableAt: PLAYABLE_AT,
				nextIsPlayableAt: PLAYABLE_AT + 7 * DAY,
			}),
		).toEqual({
			startsAt: PLAYABLE_AT + 8 * DAY,
			endsAt: PLAYABLE_AT + 15 * DAY,
		});
	});

	test("a week from now without any playable time", () => {
		expect(
			LeagueScheduling.availabilityWindow({
				now: PLAYABLE_AT,
				isPlayableAt: null,
				nextIsPlayableAt: null,
			}),
		).toEqual({ startsAt: PLAYABLE_AT, endsAt: PLAYABLE_AT + 7 * DAY });
	});
});
