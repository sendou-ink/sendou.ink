import { add } from "date-fns";
import { beforeEach, describe, expect, test, vi } from "vitest";
import * as MapResultFactory from "~/db/seed/factories/MapResultFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as Seasons from "~/features/mmr/core/Seasons";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import * as PlayerStatRepository from "./PlayerStatRepository.server";

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
const mateIds = () => users.ids().slice(1, FULL_GROUP_SIZE);
const enemyIds = () => users.ids().slice(FULL_GROUP_SIZE);

describe("PlayerStatRepository.findSeasonSetParticipantsByUserId", () => {
	beforeEach(async () => {
		await users.create(FULL_GROUP_SIZE * 2);
	});

	test("returns every other player of a SendouQ set once, typed by their side", async () => {
		await SQMatchFactory.create(
			{
				alphaUserIds: [playerId(), ...mateIds()],
				bravoUserIds: enemyIds(),
			},
			{ isConcluded: true, createdAt: DAY },
		);

		const participants =
			await PlayerStatRepository.findSeasonSetParticipantsByUserId({
				userId: playerId(),
				season: SEASON,
			});

		expect(
			participants.toSorted((a, b) => a.otherUserId - b.otherUserId),
		).toEqual([
			...mateIds().map((otherUserId) => ({
				otherUserId,
				type: "MATE",
				playedAt: expect.any(Number),
			})),
			...enemyIds().map((otherUserId) => ({
				otherUserId,
				type: "ENEMY",
				playedAt: expect.any(Number),
			})),
		]);
	});

	test("returns nothing for another season", async () => {
		await SQMatchFactory.create(
			{
				alphaUserIds: [playerId(), ...mateIds()],
				bravoUserIds: enemyIds(),
			},
			{ isConcluded: true, createdAt: DAY },
		);

		const participants =
			await PlayerStatRepository.findSeasonSetParticipantsByUserId({
				userId: playerId(),
				season: SEASON + 1,
			});

		expect(participants).toEqual([]);
	});
});

describe("PlayerStatRepository.findMapResultsByUserIdAndSeasons", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("sums a stage's records over the given seasons", async () => {
		await MapResultFactory.create({
			userId: playerId(),
			season: 1,
			mode: "SZ",
			stageId: 3,
			wins: 2,
			losses: 1,
		});
		await MapResultFactory.create({
			userId: playerId(),
			season: 2,
			mode: "SZ",
			stageId: 3,
			wins: 4,
			losses: 3,
		});

		const results = await PlayerStatRepository.findMapResultsByUserIdAndSeasons(
			{ userId: playerId(), seasons: [1, 2] },
		);

		expect(results).toEqual([{ mode: "SZ", stageId: 3, wins: 6, losses: 4 }]);
	});

	test("leaves out other seasons and other users", async () => {
		await MapResultFactory.create({ userId: playerId(), season: 0 });
		await MapResultFactory.create({ userId: users.id(2), season: 1 });

		const results = await PlayerStatRepository.findMapResultsByUserIdAndSeasons(
			{ userId: playerId(), seasons: [1, 2] },
		);

		expect(results).toEqual([]);
	});
});
