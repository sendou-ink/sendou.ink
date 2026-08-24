import { add, sub } from "date-fns";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as NotificationFactory from "~/db/seed/factories/NotificationFactory";
import * as SkillFactory from "~/db/seed/factories/SkillFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import * as Seasons from "~/features/mmr/core/Seasons";
import { refreshUserSkills } from "~/features/mmr/tiered.server";
import { NotifySeasonEndRoutine } from "./notifySeasonEnd";

const users = UserFactory.pool();

const endedSeason = Seasons.list.at(-1)!;

const { mockNotify } = vi.hoisted(() => ({
	mockNotify: vi.fn(),
}));

vi.mock("~/features/notifications/core/notify.server", () => ({
	notify: mockNotify,
}));

const createSkill = (position: number, matchesCount: number) =>
	SkillFactory.create(
		{ userId: users.id(position), season: endedSeason.nth },
		{ matchesCount },
	);

const notifiedUserIds = () => mockNotify.mock.calls[0][0].userIds as number[];

describe("NotifySeasonEndRoutine", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.setSystemTime(add(endedSeason.ends, { hours: 1 }));
		await users.create(3);
		mockNotify.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("notifies the season's participants", async () => {
		await createSkill(1, MATCHES_COUNT_NEEDED_FOR_LEADERBOARD);
		await createSkill(2, MATCHES_COUNT_NEEDED_FOR_LEADERBOARD);
		await refreshUserSkills(endedSeason.nth);

		await NotifySeasonEndRoutine.run();

		expect(mockNotify).toHaveBeenCalledTimes(1);
		expect(mockNotify).toHaveBeenCalledWith(
			expect.objectContaining({
				notification: {
					type: "SEASON_ENDED",
					meta: { seasonNth: endedSeason.nth },
				},
			}),
		);
		expect(notifiedUserIds().sort()).toEqual([users.id(1), users.id(2)].sort());
	});

	test("does NOT notify a participant whose skill is approximate", async () => {
		await createSkill(1, MATCHES_COUNT_NEEDED_FOR_LEADERBOARD);
		await createSkill(2, MATCHES_COUNT_NEEDED_FOR_LEADERBOARD - 1);
		await refreshUserSkills(endedSeason.nth);

		await NotifySeasonEndRoutine.run();

		expect(notifiedUserIds()).toEqual([users.id(1)]);
	});

	test("does NOT notify twice about the same season", async () => {
		await createSkill(1, MATCHES_COUNT_NEEDED_FOR_LEADERBOARD);
		await refreshUserSkills(endedSeason.nth);

		await NotificationFactory.create({
			notification: {
				type: "SEASON_ENDED",
				meta: { seasonNth: endedSeason.nth },
			},
			users: [{ userId: users.id(1) }],
		});

		await NotifySeasonEndRoutine.run();

		expect(mockNotify).not.toHaveBeenCalled();
	});

	test("does NOT notify when the season ended over a week ago", async () => {
		await createSkill(1, MATCHES_COUNT_NEEDED_FOR_LEADERBOARD);
		await refreshUserSkills(endedSeason.nth);

		vi.setSystemTime(add(endedSeason.ends, { days: 8 }));

		await NotifySeasonEndRoutine.run();

		expect(mockNotify).not.toHaveBeenCalled();
	});

	test("does NOT notify while the season is still ongoing", async () => {
		await createSkill(1, MATCHES_COUNT_NEEDED_FOR_LEADERBOARD);
		await refreshUserSkills(endedSeason.nth);

		vi.setSystemTime(sub(endedSeason.ends, { hours: 1 }));

		await NotifySeasonEndRoutine.run();

		expect(mockNotify).not.toHaveBeenCalled();
	});
});
