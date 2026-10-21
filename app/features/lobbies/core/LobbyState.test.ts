import { describe, expect, test } from "vitest";
import * as LobbyState from "./LobbyState";

const STARTS_AT = 10_000;
const MINUTE = 60;

describe("LobbyState.status", () => {
	test.each([
		{
			why: "long before the start",
			now: STARTS_AT - 11 * MINUTE,
			isPlaying: false,
			endedAt: null,
			expected: "UPCOMING",
		},
		{
			why: "10 minutes before",
			now: STARTS_AT - 10 * MINUTE,
			isPlaying: false,
			endedAt: null,
			expected: "CHECK_IN",
		},
		{
			why: "started, nobody playing",
			now: STARTS_AT,
			isPlaying: false,
			endedAt: null,
			expected: "PENDING",
		},
		{
			why: "started, a set being played",
			now: STARTS_AT,
			isPlaying: true,
			endedAt: null,
			expected: "ACTIVE",
		},
		{
			why: "ended",
			now: STARTS_AT,
			isPlaying: true,
			endedAt: STARTS_AT,
			expected: "ENDED",
		},
	])("$why → $expected", ({ now, isPlaying, endedAt, expected }) => {
		expect(
			LobbyState.status({
				lobby: { startsAt: STARTS_AT, endedAt },
				isPlaying,
				now,
			}),
		).toBe(expected);
	});
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
			why: "no check-in before it opens",
			status: "UPCOMING",
			viewer: { status: "REGISTERED" },
			now: 0,
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
