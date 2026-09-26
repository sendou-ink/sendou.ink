import { add } from "date-fns";
import { beforeEach, describe, expect, test, vi } from "vitest";
import * as SkillFactory from "~/db/seed/factories/SkillFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import * as Seasons from "./core/Seasons";
import * as SkillRepository from "./SkillRepository.server";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	notifyStatusChanged: vi.fn(),
	notifyNotificationsChanged: vi.fn(),
	notifyRoomsChangedByRoomIds: vi.fn(),
}));

const SEASON = Seasons.currentOrPrevious()!.nth;
const DAY = add(Seasons.nthToDateRange(SEASON).starts, { hours: 1 });

const users = UserFactory.pool();
const playerId = () => users.id(1);
const otherIds = () => users.ids().slice(1);

/** Alpha always wins a concluded match, so the player's side decides the result. */
const playSet = ({ isWin, createdAt }: { isWin: boolean; createdAt: Date }) =>
	SQMatchFactory.create(
		isWin
			? {
					alphaUserIds: [playerId(), ...otherIds().slice(0, 3)],
					bravoUserIds: otherIds().slice(3),
				}
			: {
					alphaUserIds: otherIds().slice(0, 4),
					bravoUserIds: [playerId(), ...otherIds().slice(4)],
				},
		{ isConcluded: true, createdAt },
	);

const playersOrdinalAfter = async (matchId: number) => {
	const skill = await db
		.selectFrom("Skill")
		.select("ordinal")
		.where("groupMatchId", "=", matchId)
		.where("userId", "=", playerId())
		.executeTakeFirstOrThrow();

	return skill.ordinal;
};

describe("SkillRepository.findSeasonProgressionByUserId", () => {
	beforeEach(async () => {
		await users.create(FULL_GROUP_SIZE * 2);
		await SkillFactory.create(
			{ userId: playerId(), season: SEASON },
			{ matchesCount: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD },
		);
	});

	test("day's point is the ordinal after its last set, not its peak", async () => {
		await playSet({ isWin: true, createdAt: DAY });
		const loss = await playSet({
			isWin: false,
			createdAt: add(DAY, { minutes: 30 }),
		});

		const progression = await SkillRepository.findSeasonProgressionByUserId({
			userId: playerId(),
			season: SEASON,
		});

		expect(progression).toEqual([
			{ date: expect.any(String), ordinal: await playersOrdinalAfter(loss.id) },
		]);
	});

	test("returns one point per day, days ascending", async () => {
		const firstDaySet = await playSet({ isWin: true, createdAt: DAY });
		const secondDaySet = await playSet({
			isWin: false,
			createdAt: add(DAY, { days: 1 }),
		});

		const progression = await SkillRepository.findSeasonProgressionByUserId({
			userId: playerId(),
			season: SEASON,
		});

		expect(progression.map((point) => point.ordinal)).toEqual([
			await playersOrdinalAfter(firstDaySet.id),
			await playersOrdinalAfter(secondDaySet.id),
		]);
	});
});

describe("SkillRepository.findSeasonPeakOrdinalByUserId", () => {
	beforeEach(async () => {
		await users.create(FULL_GROUP_SIZE * 2);
	});

	test("returns the highest ordinal even when the day ended lower", async () => {
		await SkillFactory.create(
			{ userId: playerId(), season: SEASON },
			{ matchesCount: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD },
		);
		const win = await playSet({ isWin: true, createdAt: DAY });
		await playSet({ isWin: false, createdAt: add(DAY, { minutes: 30 }) });

		const peak = await SkillRepository.findSeasonPeakOrdinalByUserId({
			userId: playerId(),
			season: SEASON,
		});

		expect(peak).toBe(await playersOrdinalAfter(win.id));
	});

	test("returns null before enough sets are played", async () => {
		await playSet({ isWin: true, createdAt: DAY });

		const peak = await SkillRepository.findSeasonPeakOrdinalByUserId({
			userId: playerId(),
			season: SEASON,
		});

		expect(peak).toBeNull();
	});
});
