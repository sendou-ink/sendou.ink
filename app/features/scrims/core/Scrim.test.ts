import { describe, expect, test } from "vitest";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { SCRIM_TRACKING_AUTO_LOCK_HOURS } from "../scrims-constants";
import type { ScrimFilters, ScrimPost } from "../scrims-types";
import {
	applyFilters,
	isTrackingLocked,
	participantIdsListFromAccepted,
	pickableSlots,
	rosterFit,
	sideDisplayName,
	sideOfUser,
	teamPlayers,
} from "./Scrim";

const HOUR = 60 * 60;

type MockUser = { id: number };
type MockRequest = { isAccepted: boolean; users: MockUser[] };

function createPost(users: MockUser[], requests: MockRequest[]): ScrimPost {
	return {
		id: 1,
		users,
		requests,
		createdAt: "",
		updatedAt: "",
		title: "",
		description: "",
		status: "open",
		authorId: 0,
	} as unknown as ScrimPost;
}

describe("participantIdsListFromAccepted", () => {
	test("returns only post users if no accepted request", () => {
		const post = createPost(
			[{ id: 10 }, { id: 20 }],
			[
				{
					isAccepted: false,
					users: [{ id: 30 }],
				},
			],
		);

		const result = participantIdsListFromAccepted(post);
		expect(result).toEqual([10, 20]);
	});

	test("returns post users and accepted request users", () => {
		const post = createPost(
			[{ id: 10 }, { id: 20 }],
			[
				{
					isAccepted: false,
					users: [{ id: 30 }],
				},
				{
					isAccepted: true,
					users: [{ id: 40 }, { id: 50 }],
				},
			],
		);

		const result = participantIdsListFromAccepted(post);
		expect(result).toEqual([10, 20, 40, 50]);
	});

	test("returns post users if accepted request has no users", () => {
		const post = createPost(
			[{ id: 10 }],
			[
				{
					isAccepted: true,
					users: [],
				},
			],
		);

		const result = participantIdsListFromAccepted(post);
		expect(result).toEqual([10]);
	});

	test("returns empty array if no users and no accepted request", () => {
		const post = createPost([], []);

		const result = participantIdsListFromAccepted(post);
		expect(result).toEqual([]);
	});
});

describe("sideDisplayName", () => {
	test("returns the team name when team is set", () => {
		const result = sideDisplayName({
			team: { name: "Team Olive" },
			users: [{ username: "sendou", isOwner: true }],
		});
		expect(result).toBe("Team Olive");
	});

	test("falls back to {owner}'s pickup when team is null", () => {
		const result = sideDisplayName({
			team: null,
			users: [
				{ username: "alice", isOwner: false },
				{ username: "sendou", isOwner: true },
			],
		});
		expect(result).toBe("sendou's pickup");
	});
});

describe("applyFilters", () => {
	function createPostForFilters(
		startsAt: Date,
		rangeEndsAt?: Date,
		divs?: { min: string; max: string },
	): ScrimPost {
		return {
			id: 1,
			startsAt: dateToDatabaseTimestamp(startsAt),
			rangeEndsAt: rangeEndsAt ? dateToDatabaseTimestamp(rangeEndsAt) : null,
			divs: divs ? { min: divs.min as any, max: divs.max as any } : null,
			users: [],
			requests: [],
			canceled: null,
			createdAt: databaseTimestampNow(),
			visibility: null,
			chatRoomId: null,
			text: "",
			maps: null,
			isScheduledForFuture: false,
			managedByAnyone: false,
			mapsTournament: null,
			permissions: {
				MANAGE_REQUESTS: [],
				CANCEL: [],
				DELETE_POST: [],
				MANAGE_TRACKING: [],
			},
			team: null,
		};
	}

	describe("with no filters", () => {
		test("returns true when all filters are null", () => {
			const post = createPostForFilters(new Date("2025-01-15T14:00:00"));
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: null,
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(true);
		});
	});

	describe("division filters", () => {
		test("returns true when post has no divs but filter has divs", () => {
			const post = createPostForFilters(new Date("2025-01-15T14:00:00"));
			const filters: ScrimFilters = {
				divs: { min: "5", max: "3" },
				weekdayTimes: null,
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(true);
		});

		test("returns true when only filter min is set and post max is at or above filter min", () => {
			const post = createPostForFilters(
				new Date("2025-01-15T14:00:00"),
				undefined,
				{ min: "6", max: "3" },
			);
			const filters: ScrimFilters = {
				divs: { min: "5", max: null },
				weekdayTimes: null,
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(true);
		});

		test("returns false when only filter min is set and post max is below filter min", () => {
			const post = createPostForFilters(
				new Date("2025-01-15T14:00:00"),
				undefined,
				{ min: "8", max: "6" },
			);
			const filters: ScrimFilters = {
				divs: { min: "5", max: null },
				weekdayTimes: null,
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(false);
		});

		test("returns true when only filter max is set and post min is at or below filter max", () => {
			const post = createPostForFilters(
				new Date("2025-01-15T14:00:00"),
				undefined,
				{ min: "6", max: "2" },
			);
			const filters: ScrimFilters = {
				divs: { min: null, max: "5" },
				weekdayTimes: null,
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(true);
		});

		test("returns false when only filter max is set and post min is above filter max", () => {
			const post = createPostForFilters(
				new Date("2025-01-15T14:00:00"),
				undefined,
				{ min: "3", max: "1" },
			);
			const filters: ScrimFilters = {
				divs: { min: null, max: "5" },
				weekdayTimes: null,
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(false);
		});

		test("returns true when post divs overlap with filter divs", () => {
			const post = createPostForFilters(
				new Date("2025-01-15T14:00:00"),
				undefined,
				{ min: "5", max: "3" },
			);
			const filters: ScrimFilters = {
				divs: { min: "6", max: "2" },
				weekdayTimes: null,
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(true);
		});

		test("returns true when post divs exactly match filter divs", () => {
			const post = createPostForFilters(
				new Date("2025-01-15T14:00:00"),
				undefined,
				{ min: "5", max: "3" },
			);
			const filters: ScrimFilters = {
				divs: { min: "5", max: "3" },
				weekdayTimes: null,
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(true);
		});

		test("returns false when post divs are too high for filter", () => {
			const post = createPostForFilters(
				new Date("2025-01-15T14:00:00"),
				undefined,
				{ min: "3", max: "1" },
			);
			const filters: ScrimFilters = {
				divs: { min: "6", max: "4" },
				weekdayTimes: null,
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(false);
		});

		test("returns false when post divs are too low for filter", () => {
			const post = createPostForFilters(
				new Date("2025-01-15T14:00:00"),
				undefined,
				{ min: "8", max: "6" },
			);
			const filters: ScrimFilters = {
				divs: { min: "5", max: "3" },
				weekdayTimes: null,
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(false);
		});
	});

	describe("weekday time filters", () => {
		test("returns true when post time overlaps with weekday time filter", () => {
			const post = createPostForFilters(new Date("2025-01-15T14:00:00"));
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: { start: "10:00", end: "16:00" },
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(true);
		});

		test("returns false when post time is before weekday time filter", () => {
			const post = createPostForFilters(new Date("2025-01-15T08:00:00"));
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: { start: "10:00", end: "16:00" },
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(false);
		});

		test("returns false when post time is after weekday time filter", () => {
			const post = createPostForFilters(new Date("2025-01-15T18:00:00"));
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: { start: "10:00", end: "16:00" },
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(false);
		});

		test("returns true when post time range overlaps with weekday time filter", () => {
			const post = createPostForFilters(
				new Date("2025-01-15T09:00:00"),
				new Date("2025-01-15T11:00:00"),
			);
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: { start: "10:00", end: "16:00" },
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(true);
		});

		test("returns false when post time range does not overlap with weekday time filter", () => {
			const post = createPostForFilters(
				new Date("2025-01-15T06:00:00"),
				new Date("2025-01-15T08:00:00"),
			);
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: { start: "10:00", end: "16:00" },
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(false);
		});

		test("returns true when post time range ends exactly at the filter start edge", () => {
			const post = createPostForFilters(
				new Date("2025-01-15T09:00:00"),
				new Date("2025-01-15T10:00:00"),
			);
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: { start: "10:00", end: "16:00" },
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(true);
		});

		test("returns true when a post time range crossing midnight overlaps the filter", () => {
			const post = createPostForFilters(
				new Date("2025-01-15T23:00:00"),
				new Date("2025-01-16T01:00:00"),
			);
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: { start: "00:00", end: "02:00" },
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(true);
		});

		test("returns true when a filter crossing midnight covers the post time", () => {
			const post = createPostForFilters(new Date("2025-01-15T21:00:00"));
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: { start: "20:00", end: "02:00" },
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(true);
		});
	});

	describe("weekend time filters", () => {
		test("returns true when post time overlaps with weekend time filter on Saturday", () => {
			const post = createPostForFilters(new Date("2025-01-18T14:00:00"));
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: null,
				weekendTimes: { start: "10:00", end: "18:00" },
			};

			expect(applyFilters(post, filters)).toBe(true);
		});

		test("returns true when post time overlaps with weekend time filter on Sunday", () => {
			const post = createPostForFilters(new Date("2025-01-19T14:00:00"));
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: null,
				weekendTimes: { start: "10:00", end: "18:00" },
			};

			expect(applyFilters(post, filters)).toBe(true);
		});

		test("returns false when post time is outside weekend time filter", () => {
			const post = createPostForFilters(new Date("2025-01-18T20:00:00"));
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: null,
				weekendTimes: { start: "10:00", end: "18:00" },
			};

			expect(applyFilters(post, filters)).toBe(false);
		});

		test("ignores weekday time filter on weekends", () => {
			const post = createPostForFilters(new Date("2025-01-18T20:00:00"));
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: { start: "10:00", end: "18:00" },
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(true);
		});
	});

	describe("combined filters", () => {
		test("returns true when both div and time filters match", () => {
			const post = createPostForFilters(
				new Date("2025-01-15T14:00:00"),
				undefined,
				{ min: "5", max: "3" },
			);
			const filters: ScrimFilters = {
				divs: { min: "6", max: "2" },
				weekdayTimes: { start: "10:00", end: "16:00" },
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(true);
		});

		test("returns false when div filter matches but time filter does not", () => {
			const post = createPostForFilters(
				new Date("2025-01-15T18:00:00"),
				undefined,
				{ min: "5", max: "3" },
			);
			const filters: ScrimFilters = {
				divs: { min: "6", max: "2" },
				weekdayTimes: { start: "10:00", end: "16:00" },
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(false);
		});

		test("returns false when time filter matches but div filter does not", () => {
			const post = createPostForFilters(
				new Date("2025-01-15T14:00:00"),
				undefined,
				{ min: "8", max: "6" },
			);
			const filters: ScrimFilters = {
				divs: { min: "5", max: "3" },
				weekdayTimes: { start: "10:00", end: "16:00" },
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(false);
		});

		test("returns false when neither filter matches", () => {
			const post = createPostForFilters(
				new Date("2025-01-15T18:00:00"),
				undefined,
				{ min: "8", max: "6" },
			);
			const filters: ScrimFilters = {
				divs: { min: "5", max: "3" },
				weekdayTimes: { start: "10:00", end: "16:00" },
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(false);
		});
	});
});

describe("sideOfUser", () => {
	test("returns ALPHA for users in the post's users list", () => {
		const post = createPost(
			[{ id: 1 }],
			[{ isAccepted: true, users: [{ id: 2 }] }],
		);
		expect(sideOfUser(post, 1)).toBe("ALPHA");
	});

	test("returns BRAVO for users in the accepted request's users list", () => {
		const post = createPost(
			[{ id: 1 }],
			[{ isAccepted: true, users: [{ id: 2 }] }],
		);
		expect(sideOfUser(post, 2)).toBe("BRAVO");
	});

	test("returns null for non-participants", () => {
		const post = createPost(
			[{ id: 1 }],
			[{ isAccepted: true, users: [{ id: 2 }] }],
		);
		expect(sideOfUser(post, 99)).toBeNull();
	});

	test("ignores users only in non-accepted requests", () => {
		const post = createPost(
			[{ id: 1 }],
			[{ isAccepted: false, users: [{ id: 2 }] }],
		);
		expect(sideOfUser(post, 2)).toBeNull();
	});
});

describe("isTrackingLocked", () => {
	const ONE_HOUR_MS = 60 * 60 * 1000;
	const lockWindowMs = SCRIM_TRACKING_AUTO_LOCK_HOURS * ONE_HOUR_MS;
	const now = 1_000_000_000;
	const secondsAgo = (ms: number) => (now - ms) / 1000;

	test("returns false when no map list submitted yet", () => {
		expect(isTrackingLocked({ startTime: secondsAgo(ONE_HOUR_MS), now })).toBe(
			false,
		);
	});

	test("returns false just inside the auto-lock window from list submission", () => {
		const startTime = secondsAgo(lockWindowMs);
		const updatedAt = secondsAgo(lockWindowMs - ONE_HOUR_MS);
		expect(
			isTrackingLocked({ startTime, mapLists: [{ updatedAt }], now }),
		).toBe(false);
	});

	test("returns true just past the auto-lock window from list submission", () => {
		const startTime = secondsAgo(lockWindowMs * 2);
		const updatedAt = secondsAgo(lockWindowMs + ONE_HOUR_MS);
		expect(
			isTrackingLocked({ startTime, mapLists: [{ updatedAt }], now }),
		).toBe(true);
	});

	test("uses the most recent reported map as the reference point", () => {
		const startTime = secondsAgo(lockWindowMs * 2);
		expect(
			isTrackingLocked({
				startTime,
				maps: [{ reportedAt: secondsAgo(ONE_HOUR_MS) }],
				mapLists: [{ updatedAt: secondsAgo(lockWindowMs * 2) }],
				now,
			}),
		).toBe(false);
	});

	test("uses the most recent list update when there are no reported maps", () => {
		const startTime = secondsAgo(lockWindowMs * 2);
		expect(
			isTrackingLocked({
				startTime,
				mapLists: [
					{ updatedAt: secondsAgo(lockWindowMs * 2) },
					{ updatedAt: secondsAgo(ONE_HOUR_MS) },
				],
				now,
			}),
		).toBe(false);
	});

	test("returns false when the map list was submitted long before a scrim that just started", () => {
		const startTime = secondsAgo(ONE_HOUR_MS);
		const updatedAt = secondsAgo(lockWindowMs * 10);
		expect(
			isTrackingLocked({ startTime, mapLists: [{ updatedAt }], now }),
		).toBe(false);
	});

	test("returns true once the auto-lock window has elapsed since the start time", () => {
		const startTime = secondsAgo(lockWindowMs + ONE_HOUR_MS);
		const updatedAt = secondsAgo(lockWindowMs * 10);
		expect(
			isTrackingLocked({ startTime, mapLists: [{ updatedAt }], now }),
		).toBe(true);
	});

	test("returns false for a scrim that has not started yet", () => {
		const startTime = (now + lockWindowMs) / 1000;
		const updatedAt = secondsAgo(lockWindowMs * 10);
		expect(
			isTrackingLocked({ startTime, mapLists: [{ updatedAt }], now }),
		).toBe(false);
	});
});

const freeFrom = (userId: number, startsAt: number, endsAt: number) => ({
	userId,
	ranges: [{ startsAt, endsAt }],
});

describe("pickableSlots", () => {
	const evening = (hours: number) => hours * HOUR;

	test("starts a slot the whole team is free for at its own start", () => {
		const members = [1, 2, 3, 4].map((userId) =>
			freeFrom(userId, evening(18), evening(23)),
		);

		expect(pickableSlots({ members, minPlayers: 4 })).toEqual([
			{
				startsAt: evening(18),
				endsAt: evening(23),
				userIds: [1, 2, 3, 4],
				tier: "FULL",
				fullSpan: null,
				pick: { startsAt: evening(18), rangeEnd: "+3hours" },
			},
		]);
	});

	test("starts a mixed slot where the whole team becomes free", () => {
		const members = [
			freeFrom(1, evening(18), evening(23)),
			freeFrom(2, evening(18), evening(23)),
			freeFrom(3, evening(18), evening(23)),
			freeFrom(4, evening(20), evening(23)),
		];

		expect(pickableSlots({ members, minPlayers: 4 })).toEqual([
			{
				startsAt: evening(18),
				endsAt: evening(23),
				userIds: [1, 2, 3],
				tier: "ONE_SHORT",
				fullSpan: {
					startsAt: evening(20),
					endsAt: evening(23),
					tier: "FULL",
					userIds: [1, 2, 3, 4],
				},
				pick: { startsAt: evening(20), rangeEnd: "+2hours" },
			},
		]);
	});

	test("leaves an hour of the slot to play, capped at the longest flexibility", () => {
		const twoHours = [1, 2, 3, 4].map((userId) =>
			freeFrom(userId, evening(18), evening(20)),
		);

		expect(pickableSlots({ members: twoHours, minPlayers: 4 })[0].pick).toEqual(
			{ startsAt: evening(18), rangeEnd: "+1hour" },
		);
	});

	test("gives an hour long slot no flexibility at all", () => {
		const oneHour = [1, 2, 3, 4].map((userId) =>
			freeFrom(userId, evening(18), evening(19)),
		);

		expect(pickableSlots({ members: oneHour, minPlayers: 4 })[0].pick).toEqual({
			startsAt: evening(18),
			rangeEnd: null,
		});
	});

	test("shows the longest whole-team span when the slot contains several", () => {
		const members = [
			freeFrom(1, evening(18), evening(23)),
			freeFrom(2, evening(18), evening(23)),
			freeFrom(3, evening(18), evening(23)),
			{
				userId: 4,
				ranges: [
					{ startsAt: evening(18), endsAt: evening(19) },
					{ startsAt: evening(20), endsAt: evening(23) },
				],
			},
		];

		const [slot] = pickableSlots({ members, minPlayers: 4 });

		expect(slot.fullSpan).toEqual({
			startsAt: evening(20),
			endsAt: evening(23),
			tier: "FULL",
			userIds: [1, 2, 3, 4],
		});
		expect(slot.pick.startsAt).toBe(evening(20));
	});

	test("has no slots when the team is more than one player short", () => {
		const members = [
			freeFrom(1, evening(18), evening(21)),
			freeFrom(2, evening(18), evening(21)),
			freeFrom(3, evening(21), evening(23)),
			freeFrom(4, evening(21), evening(23)),
		];

		expect(pickableSlots({ members, minPlayers: 4 })).toEqual([]);
	});
});

describe("teamPlayers", () => {
	const player = { id: 1, role: "FRONTLINE" as const, roleType: null };
	const coach = { id: 2, role: "COACH" as const, roleType: null };

	test("leaves the non-players out", () => {
		const members = [
			player,
			{ ...coach, id: 3 },
			...[4, 5, 6].map((id) => ({ ...player, id })),
		];

		expect(teamPlayers(members).map((member) => member.id)).toEqual([
			1, 4, 5, 6,
		]);
	});

	test("keeps everyone when the players alone could not field a team", () => {
		const members = [player, { ...player, id: 2 }, { ...player, id: 3 }, coach];

		expect(teamPlayers(members)).toHaveLength(4);
	});
});

describe("rosterFit", () => {
	const evening = (hours: number) => hours * HOUR;
	const free = (userId: number, startsAt: number, endsAt: number) => ({
		userId,
		reported: true,
		ranges: [{ startsAt, endsAt }],
		busy: [],
	});

	test("measures the fit at the start the most of the roster is free for", () => {
		const members = [
			free(1, evening(18), evening(23)),
			free(2, evening(18), evening(23)),
			free(3, evening(18), evening(23)),
			free(4, evening(20), evening(23)),
		];

		const fit = rosterFit({
			starts: [evening(18), evening(19), evening(20)],
			members,
		});

		expect(fit?.startsAt).toBe(evening(20));
		expect(fit?.availableCount).toBe(4);
		expect(fit?.window).toEqual({
			startsAt: evening(20),
			endsAt: evening(21.5),
		});
	});

	test("gives the earliest of equally good starts", () => {
		const members = [1, 2, 3, 4].map((userId) =>
			free(userId, evening(18), evening(23)),
		);

		expect(
			rosterFit({ starts: [evening(18), evening(19)], members })?.startsAt,
		).toBe(evening(18));
	});

	test("leaves a member free for only part of the scrim out of the count", () => {
		const members = [
			free(1, evening(18), evening(23)),
			free(2, evening(18), evening(18.5)),
		];

		const fit = rosterFit({ starts: [evening(18)], members });

		expect(fit?.availableCount).toBe(1);
		expect(fit?.entries[1].availability.status).toBe("partial");
	});

	test("reports a member committed elsewhere as busy", () => {
		const members = [
			{
				...free(1, evening(18), evening(23)),
				busy: [
					{
						startsAt: evening(19),
						endsAt: evening(21),
						type: "tournament" as const,
						name: "ITZ",
					},
				],
			},
		];

		expect(
			rosterFit({ starts: [evening(19)], members })?.entries[0].availability
				.status,
		).toBe("busy");
	});

	test("returns null when nobody filled in the week", () => {
		const members = [1, 2].map((userId) => ({
			...free(userId, evening(18), evening(23)),
			reported: false,
			ranges: [],
		}));

		expect(rosterFit({ starts: [evening(18)], members })).toBeNull();
	});
});
