import { describe, expect, test } from "vitest";
import * as GroupMatchContinueVoteFactory from "~/db/seed/factories/GroupMatchContinueVoteFactory";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { withUserId } from "~/utils/Test";
import * as GroupMatchContinueVoteRepository from "./GroupMatchContinueVoteRepository.server";

const createGroup = async () => {
	const owner = await UserFactory.create();
	const group = await SQGroupFactory.create({ memberUserIds: [owner.id] });

	return group.id;
};

const fetchVotes = (groupId: number) =>
	GroupMatchContinueVoteRepository.findAllByGroupIds([groupId]);

const castVote = (userId: number, groupId: number, isContinuing: boolean) =>
	GroupMatchContinueVoteFactory.create({ userId, groupId, isContinuing });

describe("findAllByGroupIds", () => {
	test("returns empty array without querying when no group ids given", async () => {
		const result = await GroupMatchContinueVoteRepository.findAllByGroupIds([]);
		expect(result).toEqual([]);
	});

	test("returns votes only for the requested groups with isContinuing as boolean", async () => {
		const voters = await UserFactory.createMany(3);
		const groupA = await createGroup();
		const groupB = await createGroup();
		const groupC = await createGroup();

		await castVote(voters[0].id, groupA, true);
		await castVote(voters[1].id, groupB, false);
		await castVote(voters[2].id, groupC, true);

		const result = await GroupMatchContinueVoteRepository.findAllByGroupIds([
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
	/** The subject of this block, so it goes through the repository directly. */
	const cast = (userId: number, groupId: number, isContinuing: boolean) =>
		withUserId(userId, () =>
			GroupMatchContinueVoteRepository.castOwnVote({ groupId, isContinuing }),
		);

	test("updates existing vote on conflict instead of inserting a duplicate", async () => {
		const voter = await UserFactory.create();
		const groupId = await createGroup();

		await cast(voter.id, groupId, true);
		await cast(voter.id, groupId, false);

		const votes = await fetchVotes(groupId);
		expect(votes).toHaveLength(1);
		expect(votes[0].isContinuing).toBe(false);
	});

	test("voting no clears existing yes votes for that group only", async () => {
		const voters = await UserFactory.createMany(3);
		const groupA = await createGroup();
		const groupB = await createGroup();

		await cast(voters[0].id, groupA, true);
		await cast(voters[1].id, groupA, true);
		await cast(voters[0].id, groupB, true);

		await cast(voters[2].id, groupA, false);

		const groupAVotes = await fetchVotes(groupA);
		expect(groupAVotes).toHaveLength(1);
		expect(groupAVotes[0].userId).toBe(voters[2].id);
		expect(groupAVotes[0].isContinuing).toBe(false);

		const groupBVotes = await fetchVotes(groupB);
		expect(groupBVotes).toHaveLength(1);
		expect(groupBVotes[0].isContinuing).toBe(true);
	});
});
