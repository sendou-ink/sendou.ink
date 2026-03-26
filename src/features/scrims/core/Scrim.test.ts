import { describe, expect, it } from "vitest";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import type { ScrimFilters, ScrimPost } from "../scrims-types";
import { applyFilters, participantIdsListFromAccepted } from "./Scrim";

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
	it("returns only post users if no accepted request", () => {
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

	it("returns post users and accepted request users", () => {
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

	it("returns post users if accepted request has no users", () => {
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

	it("returns empty array if no users and no accepted request", () => {
		const post = createPost([], []);

		const result = participantIdsListFromAccepted(post);
		expect(result).toEqual([]);
	});
});

describe("applyFilters", () => {
	function createPostForFilters(
		at: Date,
		rangeEnd?: Date,
		divs?: { min: string; max: string },
	): ScrimPost {
		return {
			id: 1,
			at: dateToDatabaseTimestamp(at),
			rangeEnd: rangeEnd ? dateToDatabaseTimestamp(rangeEnd) : null,
			divs: divs ? { min: divs.min as any, max: divs.max as any } : null,
			users: [],
			requests: [],
			canceled: null,
			createdAt: databaseTimestampNow(),
			visibility: null,
			chatCode: null,
			text: "",
			maps: null,
			isScheduledForFuture: false,
			managedByAnyone: false,
			mapsTournament: null,
			permissions: { MANAGE_REQUESTS: [], CANCEL: [], DELETE_POST: [] },
			team: null,
		};
	}

	describe("with no filters", () => {
		it("returns true when all filters are null", () => {
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
		it("returns true when post has no divs but filter has divs", () => {
			const post = createPostForFilters(new Date("2025-01-15T14:00:00"));
			const filters: ScrimFilters = {
				divs: { min: "5", max: "3" },
				weekdayTimes: null,
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(true);
		});

		it("returns true when only filter min is set and post max is at or above filter min", () => {
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

		it("returns false when only filter min is set and post max is below filter min", () => {
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

		it("returns true when only filter max is set and post min is at or below filter max", () => {
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

		it("returns false when only filter max is set and post min is above filter max", () => {
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

		it("returns true when post divs overlap with filter divs", () => {
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

		it("returns true when post divs exactly match filter divs", () => {
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

		it("returns false when post divs are too high for filter", () => {
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

		it("returns false when post divs are too low for filter", () => {
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
		it("returns true when post time overlaps with weekday time filter", () => {
			const post = createPostForFilters(new Date("2025-01-15T14:00:00"));
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: { start: "10:00", end: "16:00" },
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(true);
		});

		it("returns false when post time is before weekday time filter", () => {
			const post = createPostForFilters(new Date("2025-01-15T08:00:00"));
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: { start: "10:00", end: "16:00" },
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(false);
		});

		it("returns false when post time is after weekday time filter", () => {
			const post = createPostForFilters(new Date("2025-01-15T18:00:00"));
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: { start: "10:00", end: "16:00" },
				weekendTimes: null,
			};

			expect(applyFilters(post, filters)).toBe(false);
		});

		it("returns true when post time range overlaps with weekday time filter", () => {
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

		it("returns false when post time range does not overlap with weekday time filter", () => {
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

		it("returns true when post time range ends exactly at the filter start edge", () => {
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
	});

	describe("weekend time filters", () => {
		it("returns true when post time overlaps with weekend time filter on Saturday", () => {
			const post = createPostForFilters(new Date("2025-01-18T14:00:00"));
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: null,
				weekendTimes: { start: "10:00", end: "18:00" },
			};

			expect(applyFilters(post, filters)).toBe(true);
		});

		it("returns true when post time overlaps with weekend time filter on Sunday", () => {
			const post = createPostForFilters(new Date("2025-01-19T14:00:00"));
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: null,
				weekendTimes: { start: "10:00", end: "18:00" },
			};

			expect(applyFilters(post, filters)).toBe(true);
		});

		it("returns false when post time is outside weekend time filter", () => {
			const post = createPostForFilters(new Date("2025-01-18T20:00:00"));
			const filters: ScrimFilters = {
				divs: null,
				weekdayTimes: null,
				weekendTimes: { start: "10:00", end: "18:00" },
			};

			expect(applyFilters(post, filters)).toBe(false);
		});

		it("ignores weekday time filter on weekends", () => {
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
		it("returns true when both div and time filters match", () => {
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

		it("returns false when div filter matches but time filter does not", () => {
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

		it("returns false when time filter matches but div filter does not", () => {
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

		it("returns false when neither filter matches", () => {
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
