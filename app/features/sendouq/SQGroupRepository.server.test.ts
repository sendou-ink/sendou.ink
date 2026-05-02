import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as SQGroupRepository from "./SQGroupRepository.server";

const MATCH_CHAT_CODE = "match-chat";

const setupConcludedMatch = async () => {
	const alphaGroup = await db
		.insertInto("Group")
		.values({
			inviteCode: "inv-alpha",
			chatCode: "chat-alpha",
			status: "INACTIVE",
			matchmade: 1,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	const bravoGroup = await db
		.insertInto("Group")
		.values({
			inviteCode: "inv-bravo",
			chatCode: "chat-bravo",
			status: "INACTIVE",
			matchmade: 1,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	await db
		.insertInto("GroupMember")
		.values([
			{ groupId: alphaGroup.id, userId: 1, role: "OWNER" },
			{ groupId: alphaGroup.id, userId: 2, role: "REGULAR" },
			{ groupId: bravoGroup.id, userId: 3, role: "OWNER" },
			{ groupId: bravoGroup.id, userId: 4, role: "REGULAR" },
		])
		.execute();

	await db
		.insertInto("GroupMatch")
		.values({
			alphaGroupId: alphaGroup.id,
			bravoGroupId: bravoGroup.id,
			chatCode: MATCH_CHAT_CODE,
		})
		.execute();

	return { alphaGroupId: alphaGroup.id, bravoGroupId: bravoGroup.id };
};

const fetchVotes = (groupId: number) =>
	db
		.selectFrom("GroupMatchContinueVote")
		.selectAll()
		.where("groupId", "=", groupId)
		.execute();

describe("createGroup", () => {
	beforeEach(async () => {
		await dbInsertUsers(5);
	});

	afterEach(() => {
		dbReset();
	});

	test("records implicit no-vote on previous matchmade group when user creates a new group", async () => {
		const { alphaGroupId } = await setupConcludedMatch();

		const votesBefore = await fetchVotes(alphaGroupId);
		expect(votesBefore).toHaveLength(0);

		const result = await SQGroupRepository.createGroup({
			status: "ACTIVE",
			userId: 1,
		});

		const votes = await fetchVotes(alphaGroupId);
		expect(votes).toHaveLength(1);
		expect(votes[0].userId).toBe(1);
		expect(votes[0].isContinuing).toBe(0);
		expect(result.chatCodeToRevalidate).toBe(MATCH_CHAT_CODE);
	});

	test("preserves existing vote when user already voted yes on previous match", async () => {
		const { alphaGroupId } = await setupConcludedMatch();

		await db
			.insertInto("GroupMatchContinueVote")
			.values({ groupId: alphaGroupId, userId: 1, isContinuing: 1 })
			.execute();

		const result = await SQGroupRepository.createGroup({
			status: "ACTIVE",
			userId: 1,
		});

		const votes = await fetchVotes(alphaGroupId);
		expect(votes).toHaveLength(1);
		expect(votes[0].isContinuing).toBe(1);
		expect(result.chatCodeToRevalidate).toBeNull();
	});

	test("clears other members' yes votes on the previous group when recording implicit no", async () => {
		const { alphaGroupId } = await setupConcludedMatch();

		await db
			.insertInto("GroupMatchContinueVote")
			.values({ groupId: alphaGroupId, userId: 2, isContinuing: 1 })
			.execute();

		const votesBefore = await fetchVotes(alphaGroupId);
		expect(votesBefore[0].userId).toBe(2);

		await SQGroupRepository.createGroup({ status: "ACTIVE", userId: 1 });

		const votes = await fetchVotes(alphaGroupId);
		expect(votes).toHaveLength(1);
		expect(votes[0].userId).toBe(1);
		expect(votes[0].isContinuing).toBe(0);
	});

	test("does not record any vote when user has no previous matchmade group", async () => {
		const result = await SQGroupRepository.createGroup({
			status: "ACTIVE",
			userId: 1,
		});

		const allVotes = await db
			.selectFrom("GroupMatchContinueVote")
			.selectAll()
			.execute();
		expect(allVotes).toHaveLength(0);
		expect(result.chatCodeToRevalidate).toBeNull();
	});
});

describe("addMember", () => {
	beforeEach(async () => {
		await dbInsertUsers(5);
	});

	afterEach(() => {
		dbReset();
	});

	test("records implicit no-vote on previous matchmade group when user joins another group", async () => {
		const { alphaGroupId } = await setupConcludedMatch();

		const newGroup = await SQGroupRepository.createGroup({
			status: "PREPARING",
			userId: 5,
		});

		const { chatCodeToRevalidate } = await SQGroupRepository.addMember(
			newGroup.id,
			{ userId: 1 },
		);

		const votes = await fetchVotes(alphaGroupId);
		expect(votes).toHaveLength(1);
		expect(votes[0].userId).toBe(1);
		expect(votes[0].isContinuing).toBe(0);
		expect(chatCodeToRevalidate).toBe(MATCH_CHAT_CODE);
	});
});
