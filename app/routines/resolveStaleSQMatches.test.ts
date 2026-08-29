import { sub } from "date-fns";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	notifyNotificationsChanged: vi.fn(),
}));
vi.mock("~/features/mmr/tiered.server", () => ({
	refreshUserSkills: vi.fn(),
}));
vi.mock("~/features/sendouq/core/SendouQ.server", () => ({
	refreshSendouQInstance: vi.fn(),
}));
vi.mock("~/features/sendouq-streams/core/streams.server", () => ({
	refreshStreamsCache: vi.fn(),
}));

import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { ResolveStaleSQMatchesRoutine } from "./resolveStaleSQMatches";

const users = UserFactory.pool();
/** The two SendouQ groups: the first FULL_GROUP_SIZE users against the rest. */
const alphaUserIds = () => users.ids().slice(0, FULL_GROUP_SIZE);
const bravoUserIds = () => users.ids().slice(FULL_GROUP_SIZE);

const setupMatch = (options: { isReported?: boolean; createdAt?: Date } = {}) =>
	SQMatchFactory.create(
		{ alphaUserIds: alphaUserIds(), bravoUserIds: bravoUserIds() },
		options,
	);

const fetchMatch = (matchId: number) =>
	db
		.selectFrom("GroupMatch")
		.selectAll()
		.where("id", "=", matchId)
		.executeTakeFirstOrThrow();

const fetchSkills = (matchId: number) =>
	db
		.selectFrom("Skill")
		.selectAll()
		.where("groupMatchId", "=", matchId)
		.execute();

const fetchGroupStatuses = (groupIds: number[]) =>
	db.selectFrom("Group").select("status").where("id", "in", groupIds).execute();

describe("ResolveStaleSQMatchesRoutine", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));

		await users.create(FULL_GROUP_SIZE * 2);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("cancels a day-old match with no reported score", async () => {
		const match = await setupMatch({
			createdAt: sub(new Date(), { hours: 25 }),
		});

		await ResolveStaleSQMatchesRoutine.run();

		const skills = await fetchSkills(match.id);
		expect(skills).toHaveLength(1);
		expect(skills[0].season).toBe(-1);
		expect((await fetchMatch(match.id)).confirmedAt).toBeNull();
		expect(
			await fetchGroupStatuses([match.alphaGroup.id, match.bravoGroup.id]),
		).toEqual([{ status: "INACTIVE" }, { status: "INACTIVE" }]);
	});

	test("cancels a day-old match with a partial report and wipes the map winners", async () => {
		const match = await setupMatch({
			createdAt: sub(new Date(), { hours: 25 }),
		});
		for (const reportedCount of [0, 1]) {
			await SQMatchRepository.reportMapWinner({
				matchId: match.id,
				winnerId: match.alphaGroup.id,
				reportedByUserId: users.id(1),
				reportedCount,
			});
		}

		await ResolveStaleSQMatchesRoutine.run();

		const skills = await fetchSkills(match.id);
		expect(skills).toHaveLength(1);
		expect(skills[0].season).toBe(-1);

		const maps = await db
			.selectFrom("GroupMatchMap")
			.select("winnerGroupId")
			.where("matchId", "=", match.id)
			.execute();
		expect(maps.every((map) => map.winnerGroupId === null)).toBe(true);
	});

	test("confirms a day-old match one team reported but the other never confirmed", async () => {
		const match = await setupMatch({
			isReported: true,
			createdAt: sub(new Date(), { hours: 25 }),
		});

		await ResolveStaleSQMatchesRoutine.run();

		const updatedMatch = await fetchMatch(match.id);
		expect(updatedMatch.confirmedAt).not.toBeNull();
		expect(updatedMatch.confirmedByUserId).toBeNull();

		const skills = await fetchSkills(match.id);
		expect(skills.length).toBeGreaterThan(0);
		expect(skills.every((skill) => skill.season !== -1)).toBe(true);
		expect(
			await fetchGroupStatuses([match.alphaGroup.id, match.bravoGroup.id]),
		).toEqual([{ status: "INACTIVE" }, { status: "INACTIVE" }]);
	});

	test("leaves matches younger than a day untouched", async () => {
		const unreported = await setupMatch();

		const otherUsers = await UserFactory.createMany(FULL_GROUP_SIZE * 2);
		const reported = await SQMatchFactory.create(
			{
				alphaUserIds: otherUsers
					.slice(0, FULL_GROUP_SIZE)
					.map((user) => user.id),
				bravoUserIds: otherUsers.slice(FULL_GROUP_SIZE).map((user) => user.id),
			},
			{ isReported: true },
		);

		await ResolveStaleSQMatchesRoutine.run();

		expect(await fetchSkills(unreported.id)).toHaveLength(0);
		expect(await fetchSkills(reported.id)).toHaveLength(0);
		expect((await fetchMatch(reported.id)).confirmedAt).toBeNull();
	});
});
