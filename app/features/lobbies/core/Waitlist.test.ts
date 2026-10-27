import { describe, expect, test } from "vitest";
import * as Waitlist from "./Waitlist";

describe("Waitlist.slotWinners", () => {
	const PRIORITY_ENDS_AT = 1000;
	const queue = [1, 2, 3];

	test.each([
		{
			why: "head confirms, decided early",
			confirmed: [[1, 10]],
			now: 50,
			slots: 1,
			expected: [1],
		},
		{
			why: "only the third confirms, waits for the window",
			confirmed: [[3, 10]],
			now: 50,
			slots: 1,
			expected: [],
		},
		{
			why: "third gets it when the window ends",
			confirmed: [[3, 10]],
			now: 1000,
			slots: 1,
			expected: [3],
		},
		{
			why: "higher in the queue wins after the window",
			confirmed: [
				[3, 10],
				[2, 20],
			],
			now: 1000,
			slots: 1,
			expected: [2],
		},
		{
			why: "two slots: second confirming is certain",
			confirmed: [[2, 10]],
			now: 50,
			slots: 2,
			expected: [2],
		},
		{
			why: "after the window first come, first served",
			confirmed: [
				[3, 1100],
				[2, 1200],
			],
			now: 1300,
			slots: 1,
			expected: [3],
		},
		{
			why: "confirming within the window beats confirming after",
			confirmed: [
				[1, 1100],
				[3, 900],
			],
			now: 1300,
			slots: 1,
			expected: [3],
		},
	])("$why", ({ confirmed, now, slots, expected }) => {
		expect(
			Waitlist.slotWinners({
				slotCount: slots,
				queue,
				confirmedAtByUserId: new Map(confirmed.map(([a, b]) => [a, b])),
				priorityEndsAt: PRIORITY_ENDS_AT,
				now,
			}),
		).toEqual(expected);
	});
});
