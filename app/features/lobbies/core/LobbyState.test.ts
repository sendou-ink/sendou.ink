import { describe, expect, test } from "vitest";
import * as LobbyState from "./LobbyState";

const STARTS_AT = 10_000;
const MINUTE = 60;

describe("LobbyState.status", () => {
	test.each([
		{
			why: "before the start, check-in not open",
			now: STARTS_AT - 1,
			isPlaying: false,
			isCheckInOpen: false,
			endedAt: null,
			expected: "UPCOMING",
		},
		{
			why: "before the start, check-in open",
			now: STARTS_AT - 1,
			isPlaying: false,
			isCheckInOpen: true,
			endedAt: null,
			expected: "CHECK_IN",
		},
		{
			why: "started, check-in not open",
			now: STARTS_AT,
			isPlaying: false,
			isCheckInOpen: false,
			endedAt: null,
			expected: "PENDING",
		},
		{
			why: "started, nobody playing",
			now: STARTS_AT,
			isPlaying: false,
			isCheckInOpen: true,
			endedAt: null,
			expected: "PENDING",
		},
		{
			why: "started, a set being played",
			now: STARTS_AT,
			isPlaying: true,
			isCheckInOpen: true,
			endedAt: null,
			expected: "ACTIVE",
		},
		{
			why: "ended",
			now: STARTS_AT,
			isPlaying: true,
			isCheckInOpen: true,
			endedAt: STARTS_AT,
			expected: "ENDED",
		},
	])(
		"$why → $expected",
		({ now, isPlaying, isCheckInOpen, endedAt, expected }) => {
			expect(
				LobbyState.status({
					lobby: { startsAt: STARTS_AT, endedAt },
					isPlaying,
					isCheckInOpen,
					now,
				}),
			).toBe(expected);
		},
	);
});

describe("LobbyState.isCheckInOpen", () => {
	test.each([
		{
			why: "8 signed up, 10 minutes before the start",
			now: STARTS_AT - 10 * MINUTE,
			signedUp: 8,
			checkInOpenedAt: null,
			expected: true,
		},
		{
			why: "8 signed up, 11 minutes before the start",
			now: STARTS_AT - 11 * MINUTE,
			signedUp: 8,
			checkInOpenedAt: null,
			expected: false,
		},
		{
			why: "7 signed up, past the start",
			now: STARTS_AT + 60 * MINUTE,
			signedUp: 7,
			checkInOpenedAt: null,
			expected: false,
		},
		{
			why: "7 signed up and 2 waitlisted",
			now: STARTS_AT,
			signedUp: 7,
			waitlisted: 2,
			checkInOpenedAt: null,
			expected: false,
		},
		{
			why: "opened already, people left since",
			now: STARTS_AT,
			signedUp: 3,
			checkInOpenedAt: STARTS_AT - 10 * MINUTE,
			expected: true,
		},
	])(
		"$why → $expected",
		({ now, signedUp, waitlisted = 0, checkInOpenedAt, expected }) => {
			expect(
				LobbyState.isCheckInOpen({
					lobby: { startsAt: STARTS_AT, checkInOpenedAt },
					participants: participantsOf({ signedUp, waitlisted }),
					now,
				}),
			).toBe(expected);
		},
	);
});

describe("LobbyState.isAutoCloseDue", () => {
	test.each([
		{
			why: "active, recent report",
			status: "ACTIVE",
			lastActivityAt: STARTS_AT,
			pendingSince: null,
			now: STARTS_AT + 119 * MINUTE,
			expected: false,
		},
		{
			why: "active, 2 hours idle",
			status: "ACTIVE",
			lastActivityAt: STARTS_AT,
			pendingSince: null,
			now: STARTS_AT + 120 * MINUTE,
			expected: true,
		},
		{
			why: "pending 2 hours",
			status: "PENDING",
			lastActivityAt: null,
			pendingSince: STARTS_AT,
			now: STARTS_AT + 120 * MINUTE,
			expected: true,
		},
		{
			why: "upcoming never",
			status: "UPCOMING",
			lastActivityAt: null,
			pendingSince: null,
			now: STARTS_AT * 2,
			expected: false,
		},
	] as const)("$why", ({ expected, ...args }) => {
		expect(LobbyState.isAutoCloseDue(args)).toBe(expected);
	});
});

describe("LobbyState.nextHost", () => {
	test("the earliest to sign up", () => {
		expect(
			LobbyState.nextHost([
				{ userId: 3, joinedAt: 20 },
				{ userId: 2, joinedAt: 10 },
			]),
		).toBe(2);
	});

	test("nobody left", () => {
		expect(LobbyState.nextHost([])).toBeNull();
	});
});

describe("LobbyState.viewerActions", () => {
	const base = {
		isPlayingUnfinishedSet: false,
		hasFriendCode: true,
		isKicked: false,
		isCheckInOpen: true,
		activeCount: 8,
		roomSize: 10,
		startsAt: STARTS_AT,
	};

	test.each([
		{
			why: "visitor signs up",
			status: "UPCOMING",
			viewer: null,
			now: 0,
			action: "SIGN_UP",
			expected: true,
		},
		{
			why: "no friend code, no sign up",
			status: "UPCOMING",
			viewer: null,
			now: 0,
			action: "SIGN_UP",
			hasFriendCode: false,
			expected: false,
		},
		{
			why: "kicked, no sign up",
			status: "ACTIVE",
			viewer: null,
			now: 0,
			action: "SIGN_UP",
			isKicked: true,
			expected: false,
		},
		{
			why: "no check-in before it opens",
			status: "UPCOMING",
			viewer: { status: "REGISTERED" },
			now: 0,
			isCheckInOpen: false,
			action: "CHECK_IN",
			expected: false,
		},
		{
			why: "no check-in after the start before it opens",
			status: "PENDING",
			viewer: { status: "REGISTERED" },
			now: STARTS_AT,
			activeCount: 0,
			isCheckInOpen: false,
			action: "CHECK_IN",
			expected: false,
		},
		{
			why: "registered checks in",
			status: "CHECK_IN",
			viewer: { status: "REGISTERED" },
			now: STARTS_AT - 1,
			action: "CHECK_IN",
			expected: true,
		},
		{
			why: "waitlisted can't before the start",
			status: "CHECK_IN",
			viewer: { status: "WAITLISTED" },
			now: STARTS_AT - 1,
			action: "CHECK_IN",
			expected: false,
		},
		{
			why: "waitlisted can late",
			status: "ACTIVE",
			viewer: { status: "WAITLISTED" },
			now: STARTS_AT,
			action: "CHECK_IN",
			expected: true,
		},
		{
			why: "not late when full",
			status: "ACTIVE",
			viewer: { status: "WAITLISTED" },
			now: STARTS_AT,
			action: "CHECK_IN",
			activeCount: 10,
			expected: false,
		},
		{
			why: "nothing once ended",
			status: "ENDED",
			viewer: { status: "IN_ROOM" },
			now: STARTS_AT,
			action: "LEAVE",
			expected: false,
		},
	] as const)("$why", ({ action, expected, ...overrides }) => {
		expect(LobbyState.viewerActions({ ...base, ...overrides })[action]).toBe(
			expected,
		);
	});
});

describe("LobbyState.checkInOpensAt", () => {
	test("opens check-in 10 minutes before the start", () => {
		expect(LobbyState.checkInOpensAt(STARTS_AT)).toBe(STARTS_AT - 10 * MINUTE);
	});
});

describe("LobbyState.nextStatusChangeAt", () => {
	test.each([
		{
			why: "upcoming with 8 signed up → check-in opening",
			status: "UPCOMING",
			signedUp: 8,
			expected: STARTS_AT - 10 * MINUTE,
		},
		{
			why: "upcoming with 7 signed up → the start",
			status: "UPCOMING",
			signedUp: 7,
			expected: STARTS_AT,
		},
		{
			why: "check-in → the start",
			status: "CHECK_IN",
			signedUp: 8,
			expected: STARTS_AT,
		},
		{ why: "pending", status: "PENDING", signedUp: 8, expected: null },
		{ why: "active", status: "ACTIVE", signedUp: 8, expected: null },
		{ why: "ended", status: "ENDED", signedUp: 8, expected: null },
	] as const)("$why", ({ status, signedUp, expected }) => {
		expect(
			LobbyState.nextStatusChangeAt({
				status,
				startsAt: STARTS_AT,
				participants: participantsOf({ signedUp }),
			}),
		).toBe(expected);
	});
});

function participantsOf({
	signedUp,
	waitlisted = 0,
}: {
	signedUp: number;
	waitlisted?: number;
}) {
	return [
		...Array.from({ length: signedUp }, () => ({
			status: "REGISTERED" as const,
		})),
		...Array.from({ length: waitlisted }, () => ({
			status: "WAITLISTED" as const,
		})),
	];
}
