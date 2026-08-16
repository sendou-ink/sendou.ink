import { add } from "date-fns";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { clearAllTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { NotifyCheckInStartRoutine } from "./notifyCheckInStart";

const users = UserFactory.pool();

const { mockNotify } = vi.hoisted(() => ({
	mockNotify: vi.fn(),
}));

vi.mock("~/features/notifications/core/notify.server", () => ({
	notify: mockNotify,
}));

describe("NotifyCheckInStartRoutine", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
		clearAllTournamentDataCache();
		await users.create(2);
		mockNotify.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("sends notification for tournament starting exactly 1 hour from now", async () => {
		const now = new Date();
		const oneHourFromNow = add(now, { hours: 1 });

		await TournamentFactory.create({
			name: "Tournament 1 Hour Away",
			authorId: users.id(1),
			startTimes: [dateToDatabaseTimestamp(oneHourFromNow)],
		});

		await NotifyCheckInStartRoutine.run();

		expect(mockNotify).toHaveBeenCalledTimes(1);
		expect(mockNotify).toHaveBeenCalledWith(
			expect.objectContaining({
				notification: expect.objectContaining({
					type: "TO_CHECK_IN_OPENED",
					meta: expect.objectContaining({
						tournamentName: "Tournament 1 Hour Away",
					}),
				}),
			}),
		);
	});

	test("does NOT send notification for tournament starting exactly now", async () => {
		const now = new Date();

		await TournamentFactory.create({
			name: "Tournament Starting Now",
			authorId: users.id(1),
			startTimes: [dateToDatabaseTimestamp(now)],
		});

		await NotifyCheckInStartRoutine.run();

		expect(mockNotify).not.toHaveBeenCalled();
	});

	test("sends notification for tournament starting 30 minutes from now", async () => {
		const now = new Date();
		const thirtyMinutesFromNow = add(now, { minutes: 30 });

		await TournamentFactory.create({
			name: "Tournament 30 Minutes Away",
			authorId: users.id(1),
			startTimes: [dateToDatabaseTimestamp(thirtyMinutesFromNow)],
		});

		await NotifyCheckInStartRoutine.run();

		expect(mockNotify).toHaveBeenCalledTimes(1);
		expect(mockNotify).toHaveBeenCalledWith(
			expect.objectContaining({
				notification: expect.objectContaining({
					type: "TO_CHECK_IN_OPENED",
					meta: expect.objectContaining({
						tournamentName: "Tournament 30 Minutes Away",
					}),
				}),
			}),
		);
	});

	test("does NOT send notification for tournament starting more than 1 hour from now", async () => {
		const now = new Date();
		const oneAndHalfHoursFromNow = add(now, { hours: 1, minutes: 30 });

		await TournamentFactory.create({
			name: "Tournament 1.5 Hours Away",
			authorId: users.id(1),
			startTimes: [dateToDatabaseTimestamp(oneAndHalfHoursFromNow)],
		});

		await NotifyCheckInStartRoutine.run();

		expect(mockNotify).not.toHaveBeenCalled();
	});

	test("sends notifications for multiple tournaments in the time window", async () => {
		const now = new Date();
		const thirtyMinutesFromNow = add(now, { minutes: 30 });
		const fortyFiveMinutesFromNow = add(now, { minutes: 45 });

		await TournamentFactory.create({
			name: "Tournament A",
			authorId: users.id(1),
			startTimes: [dateToDatabaseTimestamp(thirtyMinutesFromNow)],
		});

		await TournamentFactory.create({
			name: "Tournament B",
			authorId: users.id(2),
			startTimes: [dateToDatabaseTimestamp(fortyFiveMinutesFromNow)],
		});

		await NotifyCheckInStartRoutine.run();

		expect(mockNotify).toHaveBeenCalledTimes(2);

		const tournamentNames = mockNotify.mock.calls.map(
			(call) => call[0].notification.meta.tournamentName,
		);
		expect(tournamentNames).toContain("Tournament A");
		expect(tournamentNames).toContain("Tournament B");
	});
});
