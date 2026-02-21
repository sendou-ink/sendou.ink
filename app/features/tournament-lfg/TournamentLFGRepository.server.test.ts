import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as TournamentLFGRepository from "./TournamentLFGRepository.server";

const createTournament = () =>
	db
		.insertInto("Tournament")
		.values({
			mapPickingStyle: "TO",
			settings: JSON.stringify({ bracketProgression: [] }),
		})
		.returning("id")
		.executeTakeFirstOrThrow();

const createGroup = (tournamentId: number, userId: number) =>
	TournamentLFGRepository.createGroup({ tournamentId, userId });

describe("createGroup", () => {
	beforeEach(async () => {
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	test("creates a group with owner member", async () => {
		const tournament = await createTournament();
		const group = await createGroup(tournament.id, 1);

		const groups = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament.id,
		);

		expect(groups).toHaveLength(1);
		expect(groups[0].id).toBe(group.id);
	});

	test("owner has OWNER role", async () => {
		const tournament = await createTournament();
		await createGroup(tournament.id, 1);

		const groups = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament.id,
		);
		const members = groups[0].members;

		expect(members[0].role).toBe("OWNER");
	});
});

describe("findGroupsByTournamentId", () => {
	beforeEach(async () => {
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("returns groups for given tournament", async () => {
		const tournament = await createTournament();
		await createGroup(tournament.id, 1);
		await createGroup(tournament.id, 2);

		const groups = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament.id,
		);

		expect(groups).toHaveLength(2);
	});

	test("returns empty array when no groups exist", async () => {
		const tournament = await createTournament();

		const groups = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament.id,
		);

		expect(groups).toHaveLength(0);
	});

	test("returns groups with member data", async () => {
		const tournament = await createTournament();
		await createGroup(tournament.id, 1);

		const groups = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament.id,
		);
		const members = groups[0].members;

		expect(members[0].id).toBe(1);
		expect(members[0].username).toBeDefined();
		expect(members[0].role).toBe("OWNER");
	});

	test("does not return groups from other tournaments", async () => {
		const tournament1 = await createTournament();
		const tournament2 = await createTournament();
		await createGroup(tournament1.id, 1);
		await createGroup(tournament2.id, 2);

		const groups = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament1.id,
		);

		expect(groups).toHaveLength(1);
	});
});

describe("addLike / deleteLike", () => {
	beforeEach(async () => {
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	test("adds a like between two groups", async () => {
		const tournament = await createTournament();
		const group1 = await createGroup(tournament.id, 1);
		const group2 = await createGroup(tournament.id, 2);

		await TournamentLFGRepository.addLike({
			likerGroupId: group1.id,
			targetGroupId: group2.id,
		});

		const likes = await TournamentLFGRepository.allLikesByGroupId(group1.id);

		expect(likes.given).toHaveLength(1);
		expect(likes.given[0].groupId).toBe(group2.id);
	});

	test("duplicate like does not throw", async () => {
		const tournament = await createTournament();
		const group1 = await createGroup(tournament.id, 1);
		const group2 = await createGroup(tournament.id, 2);

		await TournamentLFGRepository.addLike({
			likerGroupId: group1.id,
			targetGroupId: group2.id,
		});
		await TournamentLFGRepository.addLike({
			likerGroupId: group1.id,
			targetGroupId: group2.id,
		});

		const likes = await TournamentLFGRepository.allLikesByGroupId(group1.id);

		expect(likes.given).toHaveLength(1);
	});

	test("deleteLike removes the like", async () => {
		const tournament = await createTournament();
		const group1 = await createGroup(tournament.id, 1);
		const group2 = await createGroup(tournament.id, 2);

		await TournamentLFGRepository.addLike({
			likerGroupId: group1.id,
			targetGroupId: group2.id,
		});
		await TournamentLFGRepository.deleteLike({
			likerGroupId: group1.id,
			targetGroupId: group2.id,
		});

		const likes = await TournamentLFGRepository.allLikesByGroupId(group1.id);

		expect(likes.given).toHaveLength(0);
	});
});

describe("allLikesByGroupId", () => {
	beforeEach(async () => {
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("separates likes into given and received", async () => {
		const tournament = await createTournament();
		const group1 = await createGroup(tournament.id, 1);
		const group2 = await createGroup(tournament.id, 2);
		const group3 = await createGroup(tournament.id, 3);

		await TournamentLFGRepository.addLike({
			likerGroupId: group1.id,
			targetGroupId: group2.id,
		});
		await TournamentLFGRepository.addLike({
			likerGroupId: group3.id,
			targetGroupId: group1.id,
		});

		const likes = await TournamentLFGRepository.allLikesByGroupId(group1.id);

		expect(likes.given).toHaveLength(1);
		expect(likes.given[0].groupId).toBe(group2.id);
		expect(likes.received).toHaveLength(1);
		expect(likes.received[0].groupId).toBe(group3.id);
	});

	test("returns empty given/received when no likes", async () => {
		const tournament = await createTournament();
		const group = await createGroup(tournament.id, 1);

		const likes = await TournamentLFGRepository.allLikesByGroupId(group.id);

		expect(likes.given).toHaveLength(0);
		expect(likes.received).toHaveLength(0);
	});
});

describe("morphGroups", () => {
	beforeEach(async () => {
		await dbInsertUsers(5);
	});

	afterEach(() => {
		dbReset();
	});

	test("merges two groups, other group is deleted", async () => {
		const tournament = await createTournament();
		const group1 = await createGroup(tournament.id, 1);
		const group2 = await createGroup(tournament.id, 2);

		await TournamentLFGRepository.morphGroups({
			survivingGroupId: group1.id,
			otherGroupId: group2.id,
			maxGroupSize: 4,
		});

		const groups = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament.id,
		);

		expect(groups).toHaveLength(1);
		expect(groups[0].id).toBe(group1.id);
		const members = groups[0].members;
		expect(members).toHaveLength(2);
	});

	test("demotes other group's OWNER to MANAGER", async () => {
		const tournament = await createTournament();
		const group1 = await createGroup(tournament.id, 1);
		const group2 = await createGroup(tournament.id, 2);

		await TournamentLFGRepository.morphGroups({
			survivingGroupId: group1.id,
			otherGroupId: group2.id,
			maxGroupSize: 4,
		});

		const groups = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament.id,
		);
		const members = groups[0].members;
		const user2Member = members.find((m) => m.id === 2);

		expect(user2Member?.role).toBe("MANAGER");
	});

	test("throws when merged size exceeds maxGroupSize", async () => {
		const tournament = await createTournament();
		const group1 = await createGroup(tournament.id, 1);
		const group2 = await createGroup(tournament.id, 2);

		await expect(
			TournamentLFGRepository.morphGroups({
				survivingGroupId: group1.id,
				otherGroupId: group2.id,
				maxGroupSize: 1,
			}),
		).rejects.toThrow("Group has too many members after merge");
	});

	test("clears likes on surviving group after merge", async () => {
		const tournament = await createTournament();
		const group1 = await createGroup(tournament.id, 1);
		const group2 = await createGroup(tournament.id, 2);
		const group3 = await createGroup(tournament.id, 3);

		await TournamentLFGRepository.addLike({
			likerGroupId: group1.id,
			targetGroupId: group3.id,
		});
		await TournamentLFGRepository.addLike({
			likerGroupId: group3.id,
			targetGroupId: group1.id,
		});

		await TournamentLFGRepository.morphGroups({
			survivingGroupId: group1.id,
			otherGroupId: group2.id,
			maxGroupSize: 4,
		});

		const likes = await TournamentLFGRepository.allLikesByGroupId(group1.id);

		expect(likes.given).toHaveLength(0);
		expect(likes.received).toHaveLength(0);
	});
});

describe("updateMemberNote", () => {
	beforeEach(async () => {
		await dbInsertUsers(1);
	});

	afterEach(() => {
		dbReset();
	});

	test("sets and clears a member note", async () => {
		const tournament = await createTournament();
		const group = await createGroup(tournament.id, 1);

		await TournamentLFGRepository.updateMemberNote({
			groupId: group.id,
			userId: 1,
			value: "Looking for support",
		});

		let groups = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament.id,
		);
		let members = groups[0].members;
		expect(members[0].note).toBe("Looking for support");

		await TournamentLFGRepository.updateMemberNote({
			groupId: group.id,
			userId: 1,
			value: null,
		});

		groups = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament.id,
		);
		members = groups[0].members;
		expect(members[0].note).toBeNull();
	});
});

describe("updateMemberRole", () => {
	beforeEach(async () => {
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	test("changes role from REGULAR to MANAGER", async () => {
		const tournament = await createTournament();
		const group = await createGroup(tournament.id, 1);

		await db
			.insertInto("TournamentLFGGroupMember")
			.values({
				groupId: group.id,
				tournamentId: tournament.id,
				userId: 2,
				role: "REGULAR",
			})
			.execute();

		await TournamentLFGRepository.updateMemberRole({
			userId: 2,
			groupId: group.id,
			role: "MANAGER",
		});

		const groups = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament.id,
		);
		const members = groups[0].members;
		const user2Member = members.find((m) => m.id === 2);

		expect(user2Member?.role).toBe("MANAGER");
	});

	test("throws when attempting to set OWNER role", () => {
		expect(() =>
			TournamentLFGRepository.updateMemberRole({
				userId: 1,
				groupId: 1,
				role: "OWNER",
			}),
		).toThrow("Can't set role to OWNER with this function");
	});
});

describe("updateStayAsSub", () => {
	beforeEach(async () => {
		await dbInsertUsers(1);
	});

	afterEach(() => {
		dbReset();
	});

	test("toggles isStayAsSub on/off", async () => {
		const tournament = await createTournament();
		const group = await createGroup(tournament.id, 1);

		await TournamentLFGRepository.updateStayAsSub({
			groupId: group.id,
			userId: 1,
			value: true,
		});

		let subs = await TournamentLFGRepository.getSubsForTournament(
			tournament.id,
		);
		expect(subs).toContain(1);

		await TournamentLFGRepository.updateStayAsSub({
			groupId: group.id,
			userId: 1,
			value: false,
		});

		subs = await TournamentLFGRepository.getSubsForTournament(tournament.id);
		expect(subs).not.toContain(1);
	});
});

describe("leaveGroup", () => {
	beforeEach(async () => {
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("removes member from group", async () => {
		const tournament = await createTournament();
		const group = await createGroup(tournament.id, 1);

		await db
			.insertInto("TournamentLFGGroupMember")
			.values({
				groupId: group.id,
				tournamentId: tournament.id,
				userId: 2,
				role: "REGULAR",
			})
			.execute();

		await TournamentLFGRepository.leaveGroup({
			userId: 2,
			tournamentId: tournament.id,
		});

		const groups = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament.id,
		);
		const members = groups[0].members;

		expect(members).toHaveLength(1);
		expect(members[0].id).toBe(1);
	});

	test("deletes group when last member leaves", async () => {
		const tournament = await createTournament();
		await createGroup(tournament.id, 1);

		await TournamentLFGRepository.leaveGroup({
			userId: 1,
			tournamentId: tournament.id,
		});

		const groups = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament.id,
		);

		expect(groups).toHaveLength(0);
	});

	test("promotes MANAGER to OWNER when owner leaves", async () => {
		const tournament = await createTournament();
		const group = await createGroup(tournament.id, 1);

		await db
			.insertInto("TournamentLFGGroupMember")
			.values({
				groupId: group.id,
				tournamentId: tournament.id,
				userId: 2,
				role: "MANAGER",
			})
			.execute();

		await db
			.insertInto("TournamentLFGGroupMember")
			.values({
				groupId: group.id,
				tournamentId: tournament.id,
				userId: 3,
				role: "REGULAR",
			})
			.execute();

		await TournamentLFGRepository.leaveGroup({
			userId: 1,
			tournamentId: tournament.id,
		});

		const groups = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament.id,
		);
		const members = groups[0].members;
		const newOwner = members.find((m) => m.id === 2);

		expect(newOwner?.role).toBe("OWNER");
	});

	test("promotes first member to OWNER when owner leaves and no manager exists", async () => {
		const tournament = await createTournament();
		const group = await createGroup(tournament.id, 1);

		await db
			.insertInto("TournamentLFGGroupMember")
			.values({
				groupId: group.id,
				tournamentId: tournament.id,
				userId: 2,
				role: "REGULAR",
			})
			.execute();

		await TournamentLFGRepository.leaveGroup({
			userId: 1,
			tournamentId: tournament.id,
		});

		const groups = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament.id,
		);
		const members = groups[0].members;

		expect(members[0].role).toBe("OWNER");
	});
});

describe("getSubsForTournament", () => {
	beforeEach(async () => {
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	test("returns userIds with isStayAsSub", async () => {
		const tournament = await createTournament();
		await TournamentLFGRepository.createGroup({
			tournamentId: tournament.id,
			userId: 1,
			isStayAsSub: true,
		});
		await createGroup(tournament.id, 2);

		const subs = await TournamentLFGRepository.getSubsForTournament(
			tournament.id,
		);

		expect(subs).toEqual([1]);
	});

	test("returns empty when nobody opted in", async () => {
		const tournament = await createTournament();
		await createGroup(tournament.id, 1);

		const subs = await TournamentLFGRepository.getSubsForTournament(
			tournament.id,
		);

		expect(subs).toHaveLength(0);
	});
});

describe("cleanupForTournamentStart", () => {
	beforeEach(async () => {
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	test("deletes all groups for a tournament", async () => {
		const tournament = await createTournament();
		await createGroup(tournament.id, 1);
		await createGroup(tournament.id, 2);

		await TournamentLFGRepository.cleanupForTournamentStart(tournament.id);

		const groups = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament.id,
		);

		expect(groups).toHaveLength(0);
	});

	test("does not affect groups from other tournaments", async () => {
		const tournament1 = await createTournament();
		const tournament2 = await createTournament();
		await createGroup(tournament1.id, 1);
		await createGroup(tournament2.id, 2);

		await TournamentLFGRepository.cleanupForTournamentStart(tournament1.id);

		const groups1 = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament1.id,
		);
		const groups2 = await TournamentLFGRepository.findGroupsByTournamentId(
			tournament2.id,
		);

		expect(groups1).toHaveLength(0);
		expect(groups2).toHaveLength(1);
	});
});
