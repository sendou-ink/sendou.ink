import { addWeeks, subWeeks } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as AvailabilityWeekFactory from "~/db/seed/factories/AvailabilityWeekFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { databaseTimestampToDate } from "~/utils/dates";
import { AVAILABILITY } from "../availability-constants";
import * as Availability from "./Availability";
import * as RegistrationAvailability from "./RegistrationAvailability.server";

const users = UserFactory.pool();
const playerId = () => users.id(1);

const TIMEZONE = "UTC";
const HOUR = 60 * 60;
const DAY = 24 * HOUR;

const weekStartsAtIn = (weeksFromNow: number) =>
	Availability.weekStartsAt(addWeeks(new Date(), weeksFromNow), TIMEZONE);

const tournamentStartingAt = (startsAt: number) => ({
	id: 1,
	name: "In The Zone",
	organizationId: null,
	startsAt,
	minMembersPerTeam: 4,
	bracketTypes: ["single_elimination" as const],
	teamCount: 8,
});

const availabilityFor = (startsAt: number) =>
	RegistrationAvailability.registrationAvailability({
		tournament: tournamentStartingAt(startsAt),
		userIds: [playerId()],
		timezone: TIMEZONE,
	});

describe("RegistrationAvailability.registrationAvailability", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("computes nothing for a tournament past the reportable horizon", async () => {
		const startsAt = weekStartsAtIn(AVAILABILITY.WEEK_HORIZON) + 18 * HOUR;

		const result = await availabilityFor(startsAt);

		expect(result.window).toBeNull();
		expect(result.entries).toBeNull();
		expect(result.beyondHorizon?.opensAt).toBe(
			Availability.weekStartsAt(
				subWeeks(databaseTimestampToDate(startsAt), 1),
				TIMEZONE,
			),
		);
	});

	test("computes availability for a tournament on the last day still within the horizon", async () => {
		const startsAt = weekStartsAtIn(AVAILABILITY.WEEK_HORIZON) - HOUR;

		const result = await availabilityFor(startsAt);

		expect(result.beyondHorizon).toBeNull();
		expect(result.window?.startsAt).toBe(startsAt);
		expect(result.entries).toHaveLength(1);
	});

	test("returns only the day notes falling inside the tournament's window", async () => {
		const weekStartsAt = weekStartsAtIn(1);
		const startsAt = weekStartsAt + 2 * DAY + 18 * HOUR;
		const dateOfDay = (dayIndex: number) =>
			Availability.dateInTimezone(
				weekStartsAt + dayIndex * DAY + DAY / 2,
				TIMEZONE,
			);
		await AvailabilityWeekFactory.create({
			userId: playerId(),
			weekStartsAt,
			timezone: TIMEZONE,
			dayNotes: [
				{ date: dateOfDay(2), text: "Have to leave by 21" },
				{ date: dateOfDay(5), text: "Away for the weekend" },
			],
		});

		const result = await availabilityFor(startsAt);

		expect(result.entries?.[0].notes).toEqual(["Have to leave by 21"]);
	});
});
