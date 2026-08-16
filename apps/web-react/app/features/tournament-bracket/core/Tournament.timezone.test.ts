import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { testTournament } from "./tests/test-utils";

// in its own file because changing the process timezone affects every Date
// operation of the worker while these tests run
describe("regularCheckInStartsAt in a DST observing timezone", () => {
	const ORIGINAL_TZ = process.env.TZ;

	beforeAll(() => {
		process.env.TZ = "America/New_York";
	});

	afterAll(() => {
		if (ORIGINAL_TZ === undefined) {
			delete process.env.TZ;
		} else {
			process.env.TZ = ORIGINAL_TZ;
		}
	});

	test("check-in opens one hour of real time before the start also on the spring forward night", () => {
		// 3:30 AM EDT on the night the USA moves to daylight saving time
		const startsAt = new Date("2025-03-09T07:30:00Z");

		const tournament = testTournament({
			ctx: { startsAt: dateToDatabaseTimestamp(startsAt) },
		});

		expect(tournament.regularCheckInStartsAt.getTime()).toBe(
			startsAt.getTime() - 60 * 60 * 1000,
		);
	});

	test("check-in opens one hour of real time before the start also on the fall back night", () => {
		// 1:30 AM EST on the night the USA moves off daylight saving time
		const startsAt = new Date("2025-11-02T06:30:00Z");

		const tournament = testTournament({
			ctx: { startsAt: dateToDatabaseTimestamp(startsAt) },
		});

		expect(tournament.regularCheckInStartsAt.getTime()).toBe(
			startsAt.getTime() - 60 * 60 * 1000,
		);
	});
});
