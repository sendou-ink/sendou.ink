import { add } from "date-fns";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { clearAllTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import { NotifyCheckInStartRoutine } from "./notifyCheckInStart";

const { mockNotify } = vi.hoisted(() => ({
	mockNotify: vi.fn(),
}));

vi.mock("~/features/notifications/core/notify.server", () => ({
	notify: mockNotify,
}));

async function createTestTournament({
	name,
	startTime,
	authorId = 1,
	discordInviteCode = "test-discord",
}: {
	name: string;
	startTime: Date;
	authorId?: number;
	discordInviteCode?: string;
}) {
	return CalendarRepository.create({
		isFullTournament: true,
		authorId,
		badges: [],
		bracketUrl: "https://example.com/bracket",
		description: null,
		discordInviteCode,
		deadlines: "DEFAULT",
		name,
		organizationId: null,
		rules: null,
		startTimes: [dateToDatabaseTimestamp(startTime)],
		tags: null,
		bracketProgression: [
			{
				name: "Bracket",
				type: "single_elimination",
				requiresCheckIn: false,
				settings: {
					thirdPlaceMatch: false,
				},
			},
		],
		mapPickingStyle: "TO",
		mapPoolMaps: ([1, 2, 3, 4, 5] as const).map((id) => ({
			mode: "SZ",
			stageId: id,
		})),
	});
}

describe("NotifyCheckInStartRoutine", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
		dbReset();
		clearAllTournamentDataCache();
		await dbInsertUsers(5);
		mockNotify.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("sends notification for tournament starting exactly 1 hour from now", async () => {
		const now = new Date();
		const oneHourFromNow = add(now, { hours: 1 });

		await createTestTournament({
			name: "Tournament 1 Hour Away",
			startTime: oneHourFromNow,
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

		await createTestTournament({
			name: "Tournament Starting Now",
			startTime: now,
		});

		await NotifyCheckInStartRoutine.run();

		expect(mockNotify).not.toHaveBeenCalled();
	});

	test("sends notification for tournament starting 30 minutes from now", async () => {
		const now = new Date();
		const thirtyMinutesFromNow = add(now, { minutes: 30 });

		await createTestTournament({
			name: "Tournament 30 Minutes Away",
			startTime: thirtyMinutesFromNow,
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

		await createTestTournament({
			name: "Tournament 1.5 Hours Away",
			startTime: oneAndHalfHoursFromNow,
		});

		await NotifyCheckInStartRoutine.run();

		expect(mockNotify).not.toHaveBeenCalled();
	});

	test("sends notifications for multiple tournaments in the time window", async () => {
		const now = new Date();
		const thirtyMinutesFromNow = add(now, { minutes: 30 });
		const fortyFiveMinutesFromNow = add(now, { minutes: 45 });

		await createTestTournament({
			name: "Tournament A",
			startTime: thirtyMinutesFromNow,
			discordInviteCode: "test-discord-1",
		});

		await createTestTournament({
			name: "Tournament B",
			startTime: fortyFiveMinutesFromNow,
			authorId: 2,
			discordInviteCode: "test-discord-2",
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
