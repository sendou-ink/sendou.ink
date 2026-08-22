import { sub } from "date-fns";
import { describe, expect, test } from "vitest";
import { backdate } from "~/db/seed/core/backdate";
import * as GroupMatchContinueVoteFactory from "~/db/seed/factories/GroupMatchContinueVoteFactory";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as GroupMatchContinueVoteRepository from "~/features/sendouq-match/GroupMatchContinueVoteRepository.server";
import { FULL_GROUP_SIZE } from "./q-constants";
import * as SQGroupRepository from "./SQGroupRepository.server";

const setupConcludedMatch = async (
	/** Give the same members another match, for a user with a match history. */
	returningAlphaMembers?: Array<{ id: number }>,
) => {
	const bravoMembers = await UserFactory.createMany(FULL_GROUP_SIZE);
	const alphaMembers =
		returningAlphaMembers ?? (await UserFactory.createMany(FULL_GROUP_SIZE));

	const match = await SQMatchFactory.create(
		{
			alphaUserIds: alphaMembers.map((member) => member.id),
			bravoUserIds: bravoMembers.map((member) => member.id),
			isMatchmade: true,
		},
		{ isConcluded: true },
	);

	return {
		alphaGroupId: match.alphaGroup.id,
		bravoGroupId: match.bravoGroup.id,
		matchChatRoomId: match.chatRoomId,
		alphaMembers,
	};
};

const fetchVotes = (groupId: number) =>
	GroupMatchContinueVoteRepository.findAllByGroupIds([groupId]);

const castYesVote = (userId: number, groupId: number) =>
	GroupMatchContinueVoteFactory.create({ userId, groupId });

/** Creates a full team's worth of users and the team they are all members of. */
const setupTeam = async () => {
	const members = await UserFactory.createMany(FULL_GROUP_SIZE);
	const team = await TeamFactory.create({
		memberUserIds: members.map((member) => member.id),
	});

	return { team, members };
};

const groupChatRoomId = async (groupId: number) => {
	const group = await db
		.selectFrom("Group")
		.select("Group.chatRoomId")
		.where("Group.id", "=", groupId)
		.executeTakeFirstOrThrow();

	return group.chatRoomId;
};

const allChatRooms = () => db.selectFrom("ChatRoom").selectAll().execute();

const teamIdOfGroup = async (groupId: number) => {
	const group = await db
		.selectFrom("Group")
		.select("Group.teamId")
		.where("Group.id", "=", groupId)
		.executeTakeFirstOrThrow();

	return group.teamId;
};

describe("insert", () => {
	test("creates an SQ_GROUP chat room owned by the group", async () => {
		const user = await UserFactory.create();

		const result = await SQGroupRepository.insert({
			status: "PREPARING",
			userId: user.id,
		});

		const chatRoomId = await groupChatRoomId(result.id);
		expect(chatRoomId).toEqual(expect.any(Number));

		const rooms = await allChatRooms();
		expect(rooms).toHaveLength(1);
		expect(rooms[0].type).toBe("SQ_GROUP");
	});

	test("records implicit no-vote on previous matchmade group when user creates a new group", async () => {
		const { alphaGroupId, alphaMembers, matchChatRoomId } =
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
		expect(result.chatRoomIdToRevalidate).toBe(matchChatRoomId);
	});

	test("overrides the user's own yes vote on the previous match", async () => {
		const { alphaGroupId, alphaMembers, matchChatRoomId } =
			await setupConcludedMatch();

		await castYesVote(alphaMembers[0].id, alphaGroupId);

		const result = await SQGroupRepository.insert({
			status: "ACTIVE",
			userId: alphaMembers[0].id,
		});

		// leaving a yes vote standing would let the rest of the group reach a
		// unanimous vote for a group the user is no longer available for
		const votes = await fetchVotes(alphaGroupId);
		expect(votes).toHaveLength(1);
		expect(votes[0].isContinuing).toBe(false);
		expect(result.chatRoomIdToRevalidate).toBe(matchChatRoomId);
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

	test("records the implicit no-vote on the newest matchmade group of many", async () => {
		const { alphaGroupId: olderGroupId, alphaMembers } =
			await setupConcludedMatch();
		const { alphaGroupId: newerGroupId, matchChatRoomId } =
			await setupConcludedMatch(alphaMembers);
		const olderVotesBefore = await fetchVotes(olderGroupId);

		const result = await SQGroupRepository.insert({
			status: "ACTIVE",
			userId: alphaMembers[0].id,
		});

		expect(await fetchVotes(olderGroupId)).toEqual(olderVotesBefore);

		const votes = await fetchVotes(newerGroupId);
		expect(votes).toHaveLength(1);
		expect(votes[0].userId).toBe(alphaMembers[0].id);
		expect(votes[0].isContinuing).toBe(false);
		expect(result.chatRoomIdToRevalidate).toBe(matchChatRoomId);
	});

	test("leaves the previous group's votes alone on a later, unrelated queue action", async () => {
		const { alphaGroupId, alphaMembers } = await setupConcludedMatch();

		await SQGroupRepository.insert({
			status: "ACTIVE",
			userId: alphaMembers[0].id,
		});

		// the three who stayed settle the vote among themselves
		for (const member of alphaMembers.slice(1)) {
			await castYesVote(member.id, alphaGroupId);
		}

		// ...meanwhile the one who left gives up on queueing alone and queues again
		await SQGroupRepository.leaveGroup(alphaMembers[0].id);
		const result = await SQGroupRepository.insert({
			status: "ACTIVE",
			userId: alphaMembers[0].id,
		});

		const votes = await fetchVotes(alphaGroupId);
		expect(votes.filter((vote) => vote.isContinuing)).toHaveLength(
			FULL_GROUP_SIZE - 1,
		);
		expect(result.chatRoomIdToRevalidate).toBeNull();
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
		expect(result.chatRoomIdToRevalidate).toBeNull();
	});
});

describe("insertMember", () => {
	test("records implicit no-vote on previous matchmade group when user joins another group", async () => {
		const { alphaGroupId, alphaMembers, matchChatRoomId } =
			await setupConcludedMatch();
		const newOwner = await UserFactory.create();

		const newGroup = await SQGroupFactory.create({
			status: "PREPARING",
			memberUserIds: [newOwner.id],
		});

		const { chatRoomIdToRevalidate } = await SQGroupRepository.insertMember(
			newGroup.id,
			{ userId: alphaMembers[0].id },
		);

		const votes = await fetchVotes(alphaGroupId);
		expect(votes).toHaveLength(1);
		expect(votes[0].userId).toBe(alphaMembers[0].id);
		expect(votes[0].isContinuing).toBe(false);
		expect(chatRoomIdToRevalidate).toBe(matchChatRoomId);
	});
});

describe("setOldGroupsAsInactive", () => {
	test("deletes the expired groups' likes and suggestions", async () => {
		const [expiring, other] = await UserFactory.createMany(2);

		const expiringGroup = await SQGroupFactory.create({
			memberUserIds: [expiring.id],
		});
		const otherGroup = await SQGroupFactory.create({
			memberUserIds: [other.id],
		});

		await SQGroupRepository.insertLike({
			likerGroupId: otherGroup.id,
			targetGroupId: expiringGroup.id,
			createdByUserId: other.id,
		});
		await SQGroupRepository.insertSuggestion({
			suggesterGroupId: expiringGroup.id,
			targetGroupId: otherGroup.id,
			createdByUserId: expiring.id,
		});

		await backdate("Group", expiringGroup.id, {
			latestActionAt: sub(new Date(), { hours: 2 }),
		});

		await SQGroupRepository.setOldGroupsAsInactive();

		const likes = await db.selectFrom("GroupLike").selectAll().execute();
		const suggestions = await db
			.selectFrom("GroupSuggestion")
			.selectAll()
			.execute();

		expect(likes).toHaveLength(0);
		expect(suggestions).toHaveLength(0);
	});
});

describe("syncTeamId", () => {
	test("stamps the group as the team's once the last of its members joins", async () => {
		const { team, members } = await setupTeam();
		const group = await SQGroupFactory.create({
			memberUserIds: members.slice(0, -1).map((member) => member.id),
		});

		expect(await teamIdOfGroup(group.id)).toBeNull();

		await SQGroupRepository.insertMember(group.id, {
			userId: members.at(-1)!.id,
		});

		expect(await teamIdOfGroup(group.id)).toBe(team.id);
	});

	test("leaves the group unstamped when its members are not all of one team", async () => {
		const { members } = await setupTeam();
		const outsider = await UserFactory.create();
		const group = await SQGroupFactory.create({
			memberUserIds: members.slice(0, -1).map((member) => member.id),
		});

		await SQGroupRepository.insertMember(group.id, { userId: outsider.id });

		expect(await teamIdOfGroup(group.id)).toBeNull();
	});

	test("clears the stamp when a member leaves", async () => {
		const { team, members } = await setupTeam();
		const group = await SQGroupFactory.create({
			memberUserIds: members.map((member) => member.id),
		});

		expect(await teamIdOfGroup(group.id)).toBe(team.id);

		await SQGroupRepository.leaveGroup(members[0].id);

		expect(await teamIdOfGroup(group.id)).toBeNull();
	});

	test("recomputes the stamp rather than copying it from the previous group", async () => {
		const { team, members } = await setupTeam();
		const previousGroup = await SQGroupFactory.create({
			memberUserIds: members.map((member) => member.id),
		});

		expect(await teamIdOfGroup(previousGroup.id)).toBe(team.id);

		await backdate("Group", previousGroup.id, {
			latestActionAt: sub(new Date(), { hours: 2 }),
		});
		await SQGroupRepository.setOldGroupsAsInactive();

		const newGroup = await SQGroupRepository.insertFromPrevious({
			previousGroupId: previousGroup.id,
			memberUserIds: members.slice(0, -1).map((member) => member.id),
		});

		expect(await teamIdOfGroup(newGroup.id)).toBeNull();
	});
});

describe("insertFromPrevious", () => {
	test("moves the previous group's chat room to the successor", async () => {
		const { alphaGroupId, alphaMembers } = await setupConcludedMatch();
		const previousChatRoomId = await groupChatRoomId(alphaGroupId);

		const successor = await SQGroupRepository.insertFromPrevious({
			previousGroupId: alphaGroupId,
			memberUserIds: alphaMembers.map((member) => member.id),
		});

		expect(await groupChatRoomId(successor.id)).toBe(previousChatRoomId);
		expect(await groupChatRoomId(alphaGroupId)).toBeNull();
	});
});

describe("morphGroups", () => {
	test("gives the survivor a fresh chat room and deletes both old rooms", async () => {
		const [userOne, userTwo] = await UserFactory.createMany(2);
		const survivingGroup = await SQGroupFactory.create({
			memberUserIds: [userOne.id],
		});
		const otherGroup = await SQGroupFactory.create({
			memberUserIds: [userTwo.id],
		});
		const oldChatRoomId = await groupChatRoomId(survivingGroup.id);

		await SQGroupRepository.morphGroups({
			survivingGroupId: survivingGroup.id,
			otherGroupId: otherGroup.id,
		});

		const survivorChatRoomId = await groupChatRoomId(survivingGroup.id);
		expect(survivorChatRoomId).not.toBe(oldChatRoomId);

		const rooms = await allChatRooms();
		expect(rooms.map((room) => room.id)).toEqual([survivorChatRoomId]);
	});
});

describe("leaveGroup", () => {
	test("deletes the group and its chat room when the last member leaves", async () => {
		const user = await UserFactory.create();
		const group = await SQGroupFactory.create({ memberUserIds: [user.id] });

		await SQGroupRepository.leaveGroup(user.id);

		const groupRow = await db
			.selectFrom("Group")
			.selectAll()
			.where("id", "=", group.id)
			.executeTakeFirst();
		expect(groupRow).toBeUndefined();
		expect(await allChatRooms()).toHaveLength(0);
	});
});
