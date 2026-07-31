import { describe, expect, test } from "vitest";
import * as GroupMatchContinueVoteFactory from "~/db/seed/factories/GroupMatchContinueVoteFactory";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as GroupMatchContinueVoteRepository from "~/features/sendouq-match/GroupMatchContinueVoteRepository.server";
import { FULL_GROUP_SIZE } from "./q-constants";
import * as SQGroupRepository from "./SQGroupRepository.server";

const setupConcludedMatch = async () => {
	const users = await UserFactory.createMany(FULL_GROUP_SIZE * 2);
	const alphaMembers = users.slice(0, FULL_GROUP_SIZE);

	const match = await SQMatchFactory.create(
		{
			alphaUserIds: alphaMembers.map((member) => member.id),
			bravoUserIds: users.slice(FULL_GROUP_SIZE).map((member) => member.id),
			isMatchmade: true,
		},
		{ isConcluded: true },
	);

	return {
		alphaGroupId: match.alphaGroup.id,
		bravoGroupId: match.bravoGroup.id,
		matchChatCode: match.chatCode,
		alphaMembers,
	};
};

const fetchVotes = (groupId: number) =>
	GroupMatchContinueVoteRepository.findAllByGroupIds([groupId]);

const castYesVote = (userId: number, groupId: number) =>
	GroupMatchContinueVoteFactory.create({ userId, groupId });

describe("insert", () => {
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
	test("records implicit no-vote on previous matchmade group when user joins another group", async () => {
		const { alphaGroupId, alphaMembers, matchChatCode } =
			await setupConcludedMatch();
		const newOwner = await UserFactory.create();

		const newGroup = await SQGroupFactory.create({
			status: "PREPARING",
			memberUserIds: [newOwner.id],
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
