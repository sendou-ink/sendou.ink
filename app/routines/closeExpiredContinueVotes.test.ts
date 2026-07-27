import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	removeRoom: vi.fn(),
	setMetadata: vi.fn(),
}));

import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import { dbReset } from "~/utils/Test";
import { CloseExpiredContinueVotesRoutine } from "./closeExpiredContinueVotes";

let alphaUserIds: number[];
let bravoUserIds: number[];

const insertGroup = async ({
	matchmade,
	userIds,
}: {
	matchmade: 0 | 1;
	userIds: readonly number[];
}) => {
	const group = await db
		.insertInto("Group")
		.values({
			chatCode: `chat-${Math.random().toString(36).slice(2, 10)}`,
			inviteCode: `inv-${Math.random().toString(36).slice(2, 10)}`,
			status: "INACTIVE",
			matchmade,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	await db
		.insertInto("GroupMember")
		.values(
			userIds.map((userId, i) => ({
				groupId: group.id,
				userId,
				role: i === 0 ? ("OWNER" as const) : ("REGULAR" as const),
			})),
		)
		.execute();

	return group.id;
};

const insertMatch = async ({
	alphaGroupId,
	bravoGroupId,
	confirmedAtSeconds,
}: {
	alphaGroupId: number;
	bravoGroupId: number;
	confirmedAtSeconds: number;
}) => {
	await db
		.insertInto("GroupMatch")
		.values({
			alphaGroupId,
			bravoGroupId,
			chatCode: "test-match-chat",
			confirmedAt: confirmedAtSeconds,
		})
		.execute();
};

const fetchVotes = (groupId: number) =>
	db
		.selectFrom("GroupMatchContinueVote")
		.selectAll()
		.where("groupId", "=", groupId)
		.execute();

describe("CloseExpiredContinueVotesRoutine", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
		await dbReset();

		const users = await UserFactory.createMany(FULL_GROUP_SIZE * 2);
		alphaUserIds = users.slice(0, FULL_GROUP_SIZE).map((user) => user.id);
		bravoUserIds = users.slice(FULL_GROUP_SIZE).map((user) => user.id);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const nowSeconds = () => Math.floor(Date.now() / 1000);

	test("flips all non-NO members to NO for matchmade groups whose match confirmed over 1h ago", async () => {
		const alphaGroupId = await insertGroup({
			matchmade: 1,
			userIds: alphaUserIds,
		});
		const bravoGroupId = await insertGroup({
			matchmade: 1,
			userIds: bravoUserIds,
		});
		await insertMatch({
			alphaGroupId,
			bravoGroupId,
			confirmedAtSeconds: nowSeconds() - 60 * 60 * 2,
		});
		await db
			.insertInto("GroupMatchContinueVote")
			.values([
				{ groupId: alphaGroupId, userId: alphaUserIds[0], isContinuing: 1 },
				{ groupId: alphaGroupId, userId: alphaUserIds[1], isContinuing: 1 },
			])
			.execute();

		await CloseExpiredContinueVotesRoutine.run();

		const alphaVotes = await fetchVotes(alphaGroupId);
		const bravoVotes = await fetchVotes(bravoGroupId);

		expect(alphaVotes).toHaveLength(4);
		expect(alphaVotes.every((v) => v.isContinuing === 0)).toBe(true);
		expect(new Set(alphaVotes.map((v) => v.userId))).toEqual(
			new Set(alphaUserIds),
		);

		expect(bravoVotes).toHaveLength(4);
		expect(bravoVotes.every((v) => v.isContinuing === 0)).toBe(true);
	});

	test("leaves matches confirmed under 1h ago untouched", async () => {
		const alphaGroupId = await insertGroup({
			matchmade: 1,
			userIds: alphaUserIds,
		});
		const bravoGroupId = await insertGroup({
			matchmade: 1,
			userIds: bravoUserIds,
		});
		await insertMatch({
			alphaGroupId,
			bravoGroupId,
			confirmedAtSeconds: nowSeconds() - 60 * 30,
		});
		await db
			.insertInto("GroupMatchContinueVote")
			.values({
				groupId: alphaGroupId,
				userId: alphaUserIds[0],
				isContinuing: 1,
			})
			.execute();

		await CloseExpiredContinueVotesRoutine.run();

		const alphaVotes = await fetchVotes(alphaGroupId);
		expect(alphaVotes).toHaveLength(1);
		expect(alphaVotes[0].isContinuing).toBe(1);
		expect(await fetchVotes(bravoGroupId)).toHaveLength(0);
	});

	test("does not touch non-matchmade groups even if match confirmed long ago", async () => {
		const alphaGroupId = await insertGroup({
			matchmade: 0,
			userIds: alphaUserIds,
		});
		const bravoGroupId = await insertGroup({
			matchmade: 0,
			userIds: bravoUserIds,
		});
		await insertMatch({
			alphaGroupId,
			bravoGroupId,
			confirmedAtSeconds: nowSeconds() - 60 * 60 * 2,
		});

		await CloseExpiredContinueVotesRoutine.run();

		expect(await fetchVotes(alphaGroupId)).toHaveLength(0);
		expect(await fetchVotes(bravoGroupId)).toHaveLength(0);
	});

	test("skips groups whose cascade is fully resolved (every member already has a vote row)", async () => {
		const alphaGroupId = await insertGroup({
			matchmade: 1,
			userIds: alphaUserIds,
		});
		const bravoGroupId = await insertGroup({
			matchmade: 1,
			userIds: bravoUserIds,
		});
		await insertMatch({
			alphaGroupId,
			bravoGroupId,
			confirmedAtSeconds: nowSeconds() - 60 * 60 * 2,
		});
		await db
			.insertInto("GroupMatchContinueVote")
			.values(
				alphaUserIds.map((userId) => ({
					groupId: alphaGroupId,
					userId,
					isContinuing: 1 as const,
				})),
			)
			.execute();

		await CloseExpiredContinueVotesRoutine.run();

		const alphaVotes = await fetchVotes(alphaGroupId);
		expect(alphaVotes.every((v) => v.isContinuing === 1)).toBe(true);
	});
});
