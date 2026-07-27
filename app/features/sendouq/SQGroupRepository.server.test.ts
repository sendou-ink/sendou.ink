import { afterEach, describe, expect, test } from "vitest";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as GroupMatchContinueVoteRepository from "~/features/sendouq-match/GroupMatchContinueVoteRepository.server";
import { dbReset, withUserId } from "~/utils/Test";
import { FULL_GROUP_SIZE } from "./q-constants";
import * as SQGroupRepository from "./SQGroupRepository.server";

const setupConcludedMatch = async () => {
	const users = await UserFactory.createMany(FULL_GROUP_SIZE * 2);
	const alphaMembers = users.slice(0, FULL_GROUP_SIZE);

	const alphaGroup = await createMatchmadeGroup(alphaMembers);
	const bravoGroup = await createMatchmadeGroup(users.slice(FULL_GROUP_SIZE));

	const match = await SQMatchFactory.create(
		{ alphaGroupId: alphaGroup.id, bravoGroupId: bravoGroup.id },
		{ isConcluded: true },
	);

	return {
		alphaGroupId: alphaGroup.id,
		bravoGroupId: bravoGroup.id,
		matchChatCode: match.chatCode,
		alphaMembers,
	};
};

const createMatchmadeGroup = ([owner, ...members]: Array<{ id: number }>) =>
	SQGroupFactory.create(
		{
			userId: owner.id,
			additionalMemberUserIds: members.map((member) => member.id),
		},
		{ isMatchmade: true },
	);

const fetchVotes = (groupId: number) =>
	GroupMatchContinueVoteRepository.findAllByGroupIds([groupId]);

const castYesVote = (userId: number, groupId: number) =>
	withUserId(userId, () =>
		GroupMatchContinueVoteRepository.castOwnVote({
			groupId,
			isContinuing: true,
		}),
	);

describe("insert", () => {
	afterEach(async () => {
		await dbReset();
	});

	test("records implicit no-vote on previous matchmade group when user creates a new group", async () => {
		const { alphaGroupId, alphaMembers, matchChatCode } =
			await setupConcludedMatch();

		const votesBefore = await fetchVotes(alphaGroupId);
		expect(votesBefore).toHaveLength(0);

		const result = await SQGroupRepository.insert({
			status: "ACTIVE",
			userId: alphaMembers[0].id,
		});

		const votes = await fetchVotes(alphaGroupId);
		expect(votes).toHaveLength(1);
		expect(votes[0].userId).toBe(alphaMembers[0].id);
		expect(votes[0].isContinuing).toBe(false);
		expect(result.chatCodeToRevalidate).toBe(matchChatCode);
	});

	test("preserves existing vote when user already voted yes on previous match", async () => {
		const { alphaGroupId, alphaMembers } = await setupConcludedMatch();

		await castYesVote(alphaMembers[0].id, alphaGroupId);

		const result = await SQGroupRepository.insert({
			status: "ACTIVE",
			userId: alphaMembers[0].id,
		});

		const votes = await fetchVotes(alphaGroupId);
		expect(votes).toHaveLength(1);
		expect(votes[0].isContinuing).toBe(true);
		expect(result.chatCodeToRevalidate).toBeNull();
	});

	test("clears other members' yes votes on the previous group when recording implicit no", async () => {
		const { alphaGroupId, alphaMembers } = await setupConcludedMatch();

		await castYesVote(alphaMembers[1].id, alphaGroupId);

		const votesBefore = await fetchVotes(alphaGroupId);
		expect(votesBefore[0].userId).toBe(alphaMembers[1].id);

		await SQGroupRepository.insert({
			status: "ACTIVE",
			userId: alphaMembers[0].id,
		});

		const votes = await fetchVotes(alphaGroupId);
		expect(votes).toHaveLength(1);
		expect(votes[0].userId).toBe(alphaMembers[0].id);
		expect(votes[0].isContinuing).toBe(false);
	});

	test("does not record any vote when user has no previous matchmade group", async () => {
		const user = await UserFactory.create();

		const result = await SQGroupRepository.insert({
			status: "ACTIVE",
			userId: user.id,
		});

		const allVotes = await GroupMatchContinueVoteRepository.findAllByGroupIds([
			result.id,
		]);
		expect(allVotes).toHaveLength(0);
		expect(result.chatCodeToRevalidate).toBeNull();
	});
});

describe("insertMember", () => {
	afterEach(async () => {
		await dbReset();
	});

	test("records implicit no-vote on previous matchmade group when user joins another group", async () => {
		const { alphaGroupId, alphaMembers, matchChatCode } =
			await setupConcludedMatch();
		const newOwner = await UserFactory.create();

		const newGroup = await SQGroupFactory.create({
			status: "PREPARING",
			userId: newOwner.id,
		});

		const { chatCodeToRevalidate } = await SQGroupRepository.insertMember(
			newGroup.id,
			{ userId: alphaMembers[0].id },
		);

		const votes = await fetchVotes(alphaGroupId);
		expect(votes).toHaveLength(1);
		expect(votes[0].userId).toBe(alphaMembers[0].id);
		expect(votes[0].isContinuing).toBe(false);
		expect(chatCodeToRevalidate).toBe(matchChatCode);
	});
});
