import { subMonths, subWeeks } from "date-fns";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as AvailabilityWeekFactory from "~/db/seed/factories/AvailabilityWeekFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as AvailabilityRepository from "~/features/availability/AvailabilityRepository.server";
import { AVAILABILITY } from "~/features/availability/availability-constants";
import * as Availability from "~/features/availability/core/Availability";
import { DeleteOldAvailabilityRoutine } from "./deleteOldAvailability";

const users = UserFactory.pool();

const NOW = new Date("2026-08-24T09:00:00Z");

const seedWeekOf = (date: Date) =>
	AvailabilityWeekFactory.create({
		userId: users.id(1),
		weekStartsAt: Availability.weekStartsAt(date, "UTC"),
		timezone: "UTC",
	});

const remainingWeekStarts = async () =>
	(
		await AvailabilityRepository.findAllWeeksByUserIds({
			userIds: [users.id(1)],
			startsAt: 0,
			endsAt: Availability.weekStartsAt(NOW, "UTC") + 1,
		})
	).map((week) => week.weekStartsAt);

describe("DeleteOldAvailabilityRoutine", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		await users.create(1);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("deletes weeks that ended over the retention period ago, keeping the rest", async () => {
		const retentionAgo = subMonths(NOW, AVAILABILITY.RETENTION_MONTHS);
		const longGone = subWeeks(retentionAgo, 4);
		// the week the retention period reaches into still ends inside it
		const justInside = retentionAgo;

		await seedWeekOf(longGone);
		await seedWeekOf(justInside);
		await seedWeekOf(NOW);

		await DeleteOldAvailabilityRoutine.run();

		expect(await remainingWeekStarts()).toEqual([
			Availability.weekStartsAt(justInside, "UTC"),
			Availability.weekStartsAt(NOW, "UTC"),
		]);
	});
});
