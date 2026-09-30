import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as AvailabilityWeekFactory from "~/db/seed/factories/AvailabilityWeekFactory";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as Availability from "~/features/availability/core/Availability";
import { NotifyScheduleTeamReminderRoutine } from "./notifyScheduleTeamReminder";

const users = UserFactory.pool();

const { mockNotify } = vi.hoisted(() => ({
	mockNotify: vi.fn(),
}));

vi.mock("~/features/notifications/core/notify.server", () => ({
	notify: mockNotify,
}));

const MONDAY = new Date("2026-08-24T09:00:00Z");
const WEDNESDAY = new Date("2026-08-26T09:00:00Z");

const reportCurrentWeek = (userId: number) =>
	AvailabilityWeekFactory.create({
		userId,
		weekStartsAt: Availability.weekStartsAt(MONDAY, "UTC"),
		timezone: "UTC",
	});

describe("NotifyScheduleTeamReminderRoutine", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.setSystemTime(MONDAY);
		await users.create(2);
		mockNotify.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("notifies the teammate who has not reported the week", async () => {
		await TeamFactory.create({ memberUserIds: [users.id(1), users.id(2)] });
		await reportCurrentWeek(users.id(1));

		await NotifyScheduleTeamReminderRoutine.run();

		expect(mockNotify).toHaveBeenCalledWith({
			notification: { type: "SCHEDULE_TEAM_REMINDER" },
			userIds: [users.id(2)],
		});
	});

	test("notifies nobody when no teammate reported the week", async () => {
		await TeamFactory.create({ memberUserIds: [users.id(1), users.id(2)] });

		await NotifyScheduleTeamReminderRoutine.run();

		expect(mockNotify).not.toHaveBeenCalled();
	});

	test("does nothing on a day that is not the first of the week", async () => {
		vi.setSystemTime(WEDNESDAY);
		await TeamFactory.create({ memberUserIds: [users.id(1), users.id(2)] });
		await reportCurrentWeek(users.id(1));

		await NotifyScheduleTeamReminderRoutine.run();

		expect(mockNotify).not.toHaveBeenCalled();
	});
});
