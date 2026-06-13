import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import { dbInsertUsers, dbReset, withUserId } from "~/utils/Test";
import * as GroupMatchContinueVoteRepository from "./GroupMatchContinueVoteRepository.server";

const insertGroup = async () => {
	const group = await db
		.insertInto("Group")
		.values({
			inviteCode: `inv-${Math.random().toString(36).slice(2, 10)}`,
			chatCode: `chat-${Math.random().toString(36).slice(2, 10)}`,
			status: "ACTIVE",
		})
		.returning("id")
		.executeTakeFirstOrThrow();
	return group.id;
};

const fetchVotes = (groupId: number) =>
	db
		.selectFrom("GroupMatchContinueVote")
		.selectAll()
		.where("groupId", "=", groupId)
		.execute();

describe("findForGroups", () => {
	beforeEach(async () => {
		await dbInsertUsers(4);
	});

	afterEach(() => {
		dbReset();
	});

	test("returns empty array without querying when no group ids given", async () => {
		const result = await GroupMatchContinueVoteRepository.findForGroups([]);
		expect(result).toEqual([]);
	});

	test("returns votes only for the requested groups with isContinuing as boolean", async () => {
		const groupA = await insertGroup();
		const groupB = await insertGroup();
		const groupC = await insertGroup();

		await withUserId(1, () =>
			GroupMatchContinueVoteRepository.cast({
				groupId: groupA,
				isContinuing: 1,
			}),
		);
		await withUserId(2, () =>
			GroupMatchContinueVoteRepository.cast({
				groupId: groupB,
				isContinuing: 0,
			}),
		);
		await withUserId(3, () =>
			GroupMatchContinueVoteRepository.cast({
				groupId: groupC,
				isContinuing: 1,
			}),
		);

		const result = await GroupMatchContinueVoteRepository.findForGroups([
			groupA,
			groupB,
		]);

		expect(result).toHaveLength(2);
		const groupAVote = result.find((v) => v.groupId === groupA);
		const groupBVote = result.find((v) => v.groupId === groupB);
		expect(groupAVote?.isContinuing).toBe(true);
		expect(groupBVote?.isContinuing).toBe(false);
	});
});

describe("cast", () => {
	beforeEach(async () => {
		await dbInsertUsers(4);
	});

	afterEach(() => {
		dbReset();
	});

	test("updates existing vote on conflict instead of inserting a duplicate", async () => {
		const groupId = await insertGroup();

		await withUserId(1, () =>
			GroupMatchContinueVoteRepository.cast({
				groupId,
				isContinuing: 1,
			}),
		);
		await withUserId(1, () =>
			GroupMatchContinueVoteRepository.cast({
				groupId,
				isContinuing: 0,
			}),
		);

		const votes = await fetchVotes(groupId);
		expect(votes).toHaveLength(1);
		expect(votes[0].isContinuing).toBe(0);
	});

	test("voting no clears existing yes votes for that group only", async () => {
		const groupA = await insertGroup();
		const groupB = await insertGroup();

		await withUserId(1, () =>
			GroupMatchContinueVoteRepository.cast({
				groupId: groupA,
				isContinuing: 1,
			}),
		);
		await withUserId(2, () =>
			GroupMatchContinueVoteRepository.cast({
				groupId: groupA,
				isContinuing: 1,
			}),
		);
		await withUserId(1, () =>
			GroupMatchContinueVoteRepository.cast({
				groupId: groupB,
				isContinuing: 1,
			}),
		);

		await withUserId(3, () =>
			GroupMatchContinueVoteRepository.cast({
				groupId: groupA,
				isContinuing: 0,
			}),
		);

		const groupAVotes = await fetchVotes(groupA);
		expect(groupAVotes).toHaveLength(1);
		expect(groupAVotes[0].userId).toBe(3);
		expect(groupAVotes[0].isContinuing).toBe(0);

		const groupBVotes = await fetchVotes(groupB);
		expect(groupBVotes).toHaveLength(1);
		expect(groupBVotes[0].isContinuing).toBe(1);
	});
});
