import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "~/db/sql";
import { refreshUserSkills } from "~/features/mmr/tiered.server";
import * as PrivateUserNoteRepository from "~/features/sendouq/PrivateUserNoteRepository.server";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as SQGroupRepository from "../SQGroupRepository.server";
import { refreshSendouQInstance, SendouQ } from "./SendouQ.server";

const { mockSeasonCurrentOrPrevious } = vi.hoisted(() => ({
	mockSeasonCurrentOrPrevious: vi.fn(() => ({
		nth: 1,
		starts: new Date("2023-01-01"),
		ends: new Date("2030-12-31"),
	})),
}));

vi.mock("~/features/mmr/core/Seasons", () => ({
	currentOrPrevious: mockSeasonCurrentOrPrevious,
}));

const createGroup = async (
	userIds: number[],
	options: {
		status?: "PREPARING" | "ACTIVE";
		inviteCode?: string;
	} = {},
) => {
	const { status = "ACTIVE", inviteCode } = options;

	const groupResult = await SQGroupRepository.createGroup({
		status,
		userId: userIds[0],
	});

	if (inviteCode) {
		await db
			.updateTable("Group")
			.set({ inviteCode })
			.where("id", "=", groupResult.id)
			.execute();
	}

	for (let i = 1; i < userIds.length; i++) {
		await SQGroupRepository.addMember(groupResult.id, {
			userId: userIds[i],
			role: "REGULAR",
		});
	}

	return groupResult.id;
};

const createMatch = async (
	alphaGroupId: number,
	bravoGroupId: number,
	options: { reportedAt?: number } = {},
) => {
	const { reportedAt = Date.now() } = options;

	await db
		.insertInto("GroupMatch")
		.values({
			alphaGroupId,
			bravoGroupId,
			reportedAt,
		})
		.execute();
};

const createPrivateNote = async (
	authorId: number,
	targetId: number,
	sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE",
	text = "test note",
) => {
	await PrivateUserNoteRepository.upsert({
		authorId,
		targetId,
		sentiment,
		text,
	});
};

const insertSkill = async (userId: number, ordinal: number, season = 1) => {
	await db
		.insertInto("Skill")
		.values({
			userId,
			season,
			mu: 25,
			sigma: 8.333,
			ordinal,
			matchesCount: 10,
		})
		.execute();
};

describe("SendouQ", () => {
	describe("currentViewByUserId", () => {
		beforeEach(async () => {
			await dbInsertUsers(4);
		});

		afterEach(() => {
			dbReset();
		});

		test("returns 'default' when user not in any group", async () => {
			await refreshSendouQInstance();

			const view = SendouQ.currentViewByUserId(1);

			expect(view).toBe("default");
		});

		test("returns 'preparing' when user in PREPARING group", async () => {
			await createGroup([1], { status: "PREPARING" });
			await refreshSendouQInstance();

			const view = SendouQ.currentViewByUserId(1);

			expect(view).toBe("preparing");
		});

		test("returns 'match' when user in ACTIVE group with matchId", async () => {
			const groupId1 = await createGroup([1]);
			const groupId2 = await createGroup([2]);

			await createMatch(groupId1, groupId2);

			await refreshSendouQInstance();

			const view = SendouQ.currentViewByUserId(1);

			expect(view).toBe("match");
		});

		test("returns 'looking' when user in ACTIVE group without matchId", async () => {
			await createGroup([1], { status: "ACTIVE" });
			await refreshSendouQInstance();

			const view = SendouQ.currentViewByUserId(1);

			expect(view).toBe("looking");
		});
	});

	describe("findOwnGroup", () => {
		beforeEach(async () => {
			await dbInsertUsers(8);
		});

		afterEach(() => {
			dbReset();
		});

		test("returns group when user is a member", async () => {
			await createGroup([1, 2, 3]);
			await refreshSendouQInstance();

			const group = SendouQ.findOwnGroup(1);

			expect(group).toBeDefined();
			expect(group?.members.some((m) => m.id === 1)).toBe(true);
		});

		test("returns undefined when user not in any group", async () => {
			await createGroup([1, 2, 3]);
			await refreshSendouQInstance();

			const group = SendouQ.findOwnGroup(4);

			expect(group).toBeUndefined();
		});

		test("returns group with correct role when user is OWNER", async () => {
			await createGroup([1, 2]);
			await refreshSendouQInstance();

			const group = SendouQ.findOwnGroup(1);

			expect(group).toBeDefined();
			const member = group?.members.find((m) => m.id === 1);
			expect(member?.role).toBe("OWNER");
		});

		test("returns group with correct role when user is REGULAR member", async () => {
			await createGroup([1, 2]);
			await refreshSendouQInstance();

			const group = SendouQ.findOwnGroup(2);

			expect(group).toBeDefined();
			const member = group?.members.find((m) => m.id === 2);
			expect(member?.role).toBe("REGULAR");
		});

		test("returns correct group when multiple groups exist", async () => {
			await createGroup([1, 2]);
			await createGroup([3, 4]);
			await createGroup([5, 6]);
			await refreshSendouQInstance();

			const group = SendouQ.findOwnGroup(5);

			expect(group).toBeDefined();
			expect(group?.members.some((m) => m.id === 5)).toBe(true);
			expect(group?.members.some((m) => m.id === 1)).toBe(false);
		});
	});

	describe("findGroupByInviteCode", () => {
		beforeEach(async () => {
			await dbInsertUsers(4);
		});

		afterEach(() => {
			dbReset();
		});

		test("returns group when invite code is valid", async () => {
			await createGroup([1], { inviteCode: "ABC123" });
			await refreshSendouQInstance();

			const group = SendouQ.findGroupByInviteCode("ABC123");

			expect(group).toBeDefined();
			expect(group?.inviteCode).toBe("ABC123");
		});

		test("returns undefined when invite code is invalid", async () => {
			await createGroup([1], { inviteCode: "ABC123" });
			await refreshSendouQInstance();

			const group = SendouQ.findGroupByInviteCode("INVALID");

			expect(group).toBeUndefined();
		});

		test("returns correct group when multiple groups exist", async () => {
			await createGroup([1], { inviteCode: "CODE1" });
			await createGroup([2], { inviteCode: "CODE2" });
			await createGroup([3], { inviteCode: "CODE3" });
			await refreshSendouQInstance();

			const group = SendouQ.findGroupByInviteCode("CODE2");

			expect(group).toBeDefined();
			expect(group?.members[0].id).toBe(2);
		});
	});

	describe("previewGroups", () => {
		beforeEach(async () => {
			await dbInsertUsers(12);
		});

		afterEach(() => {
			dbReset();
		});

		test("returns empty array when no groups exist", async () => {
			await refreshSendouQInstance();

			const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
			const groups = SendouQ.previewGroups(1, notes);

			expect(groups).toEqual([]);
		});

		test("censors members for full groups", async () => {
			await createGroup([1, 2, 3, 4]);
			await refreshSendouQInstance();

			const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
			const groups = SendouQ.previewGroups(1, notes);

			expect(groups).toHaveLength(1);
			expect(groups[0].members).toBeUndefined();
		});

		test("shows members for partial groups", async () => {
			await createGroup([1, 2]);
			await refreshSendouQInstance();

			const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
			const groups = SendouQ.previewGroups(1, notes);

			expect(groups).toHaveLength(1);
			expect(groups[0].members).toBeDefined();
			expect(groups[0].members).toHaveLength(2);
		});

		test("attaches private notes to members", async () => {
			await createGroup([1, 2]);
			await createPrivateNote(3, 2, "POSITIVE", "Great player");
			await refreshSendouQInstance();

			const notes = await PrivateUserNoteRepository.byAuthorUserId(3);
			const groups = SendouQ.previewGroups(3, notes);

			expect(groups).toHaveLength(1);
			const member = groups[0].members?.find((m) => m.id === 2);
			expect(member?.privateNote).toBeDefined();
			expect(member?.privateNote?.sentiment).toBe("POSITIVE");
		});

		test("removes inviteCode and chatCode from all groups", async () => {
			await createGroup([1, 2], { inviteCode: "CODE1" });
			await createGroup([3, 4, 5, 6], { inviteCode: "CODE2" });
			await refreshSendouQInstance();

			const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
			const groups = SendouQ.previewGroups(1, notes);

			expect(groups).toHaveLength(2);
			for (const group of groups) {
				expect(group).not.toHaveProperty("inviteCode");
				expect(group).not.toHaveProperty("chatCode");
			}
		});

		test("applies correct censoring for mix of full and partial groups", async () => {
			await createGroup([1, 2]);
			await createGroup([3, 4, 5, 6]);
			await createGroup([7, 8, 9]);
			await refreshSendouQInstance();

			const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
			const groups = SendouQ.previewGroups(1, notes);

			expect(groups).toHaveLength(3);

			const partialGroups = groups.filter((g) => g.members !== undefined);
			const fullGroups = groups.filter((g) => g.members === undefined);

			expect(partialGroups).toHaveLength(2);
			expect(fullGroups).toHaveLength(1);
		});

		test("censors tier and sets tier range for full groups", async () => {
			await createGroup([1, 2, 3, 4]);
			await createGroup([5, 6]);
			await refreshSendouQInstance();

			const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
			const groups = SendouQ.previewGroups(1, notes);

			const fullGroup = groups.find((g) => g.members === undefined);
			const partialGroup = groups.find((g) => g.members !== undefined);

			expect(fullGroup?.tier).toBeNull();
			expect(fullGroup?.tierRange).toBeDefined();

			expect(fullGroup?.tierRange?.range[0].name).toBe("IRON");
			expect(fullGroup?.tierRange?.range[1].name).toBe("LEVIATHAN");

			expect(partialGroup?.tier).toBeDefined();
			expect(partialGroup?.tierRange).toBeNull();
		});

		describe("tier sorting", () => {
			beforeEach(() => {
				refreshUserSkills(1);
			});

			test("sorts full groups by tier when viewer has a tier", async () => {
				await insertSkill(1, 1000);
				await insertSkill(2, 500);
				await insertSkill(3, 500);
				await insertSkill(4, 500);
				await insertSkill(5, 500);
				await insertSkill(6, 2000);
				await insertSkill(7, 2000);
				await insertSkill(8, 2000);
				await insertSkill(9, 2000);

				const group1Id = await createGroup([2, 3, 4, 5]);
				const group2Id = await createGroup([6, 7, 8, 9]);
				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.previewGroups(1, notes);

				expect(groups).toHaveLength(2);
				expect(groups[0].id).toBe(group1Id);
				expect(groups[1].id).toBe(group2Id);
			});

			test("sorts partial groups by tier relative to viewer", async () => {
				await insertSkill(1, 1000);
				await insertSkill(2, 500);
				await insertSkill(3, 2000);
				await insertSkill(4, 1050);

				await createGroup([4]);
				await createGroup([2]);
				await createGroup([3]);
				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.previewGroups(1, notes);

				expect(groups).toHaveLength(3);
				expect(groups[0].members![0].id).toBe(4);
				expect(groups[1].members![0].id).toBe(2);
				expect(groups[2].members![0].id).toBe(3);
			});

			test("full groups are sorted last regardless of tier", async () => {
				await insertSkill(1, 1000);
				await insertSkill(2, 1100);
				await insertSkill(3, 1100);
				await insertSkill(4, 1100);
				await insertSkill(5, 1100);
				await insertSkill(6, 500);

				const fullGroupId = await createGroup([2, 3, 4, 5]);
				const partialGroupId = await createGroup([6]);
				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.previewGroups(1, notes);

				expect(groups).toHaveLength(2);
				expect(groups[0].id).toBe(partialGroupId);
				expect(groups[1].id).toBe(fullGroupId);
			});

			test("sorts by sentiment first, then tier within same sentiment", async () => {
				await insertSkill(1, 1000);
				await insertSkill(2, 500);
				await insertSkill(3, 2000);
				await insertSkill(4, 1050);

				await createGroup([2]);
				await createGroup([3]);
				await createGroup([4]);
				await createPrivateNote(1, 2, "POSITIVE");
				await createPrivateNote(1, 3, "NEGATIVE");
				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.previewGroups(1, notes);

				expect(groups).toHaveLength(3);
				expect(groups[0].members![0].id).toBe(2);
				expect(groups[1].members![0].id).toBe(4);
				expect(groups[2].members![0].id).toBe(3);
			});

			test("handles viewer without skill gracefully", async () => {
				await insertSkill(2, 500);
				await insertSkill(3, 2000);

				await createGroup([2]);
				await createGroup([3]);
				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.previewGroups(1, notes);

				expect(groups).toHaveLength(2);
			});
		});
	});

	describe("lookingGroups", () => {
		describe("filtering", () => {
			beforeEach(async () => {
				await dbInsertUsers(20);
			});

			afterEach(() => {
				dbReset();
			});

			test("returns empty array when user not in a group", async () => {
				await createGroup([1, 2, 3, 4]);
				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(5);
				const groups = SendouQ.lookingGroups(5, notes);

				expect(groups).toEqual([]);
			});

			test("only returns ACTIVE groups", async () => {
				await createGroup([1]);
				await createGroup([2], { status: "PREPARING" });
				const group3 = await createGroup([3]);
				await db
					.updateTable("Group")
					.set({ status: "INACTIVE" })
					.where("id", "=", group3)
					.execute();
				await createGroup([4], { status: "ACTIVE" });
				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				expect(groups).toHaveLength(1);
				expect(groups[0].members![0].id).toBe(4);
			});

			test("only returns groups without matchId", async () => {
				await createGroup([1]);
				await createGroup([2]);
				await createGroup([3]);

				await createMatch(1, 2);

				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				expect(groups).toHaveLength(1);
				expect(groups[0].members![0].id).toBe(3);
			});

			test("excludes own group from results", async () => {
				await createGroup([1, 2]);
				await createGroup([3, 4]);
				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				expect(groups).toHaveLength(1);
				expect(groups[0].members?.some((m) => m.id === 1)).toBe(false);
			});

			test("own group size 4 only shows size 4 groups", async () => {
				await createGroup([1, 2, 3, 4]);
				await createGroup([5]);
				await createGroup([6, 7]);
				await createGroup([8, 9, 10]);
				await createGroup([11, 12, 13, 14]);
				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				expect(groups).toHaveLength(1);
				expect(groups[0].members).toBeUndefined();
			});

			test("own group size 3 only shows size 1 groups", async () => {
				await createGroup([1, 2, 3]);
				await createGroup([4]);
				await createGroup([5, 6]);
				await createGroup([7, 8, 9]);
				await createGroup([10, 11, 12, 13]);
				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				expect(groups).toHaveLength(1);
				expect(groups[0].members).toHaveLength(1);
				expect(groups[0].members![0].id).toBe(4);
			});

			test("own group size 2 shows size 1 and 2 groups", async () => {
				await createGroup([1, 2]);
				await createGroup([3]);
				await createGroup([4, 5]);
				await createGroup([6, 7, 8]);
				await createGroup([9, 10, 11, 12]);
				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				expect(groups).toHaveLength(2);
				const groupSizes = groups.map((g) => g.members!.length);
				expect(groupSizes).toContain(1);
				expect(groupSizes).toContain(2);
			});

			test("own group size 1 shows size 1, 2, and 3 groups", async () => {
				await createGroup([1]);
				await createGroup([2]);
				await createGroup([3, 4]);
				await createGroup([5, 6, 7]);
				await createGroup([8, 9, 10, 11]);
				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				expect(groups).toHaveLength(3);
				const groupSizes = groups.map((g) => g.members!.length);
				expect(groupSizes).toContain(1);
				expect(groupSizes).toContain(2);
				expect(groupSizes).toContain(3);
			});
		});

		describe("replay detection", () => {
			beforeEach(async () => {
				await dbInsertUsers(12);
			});

			afterEach(() => {
				dbReset();
			});

			test("marks group as replay when 3+ members overlap", async () => {
				const group1 = await createGroup([1, 2, 3, 4]);
				const group2 = await createGroup([5, 6, 7, 8]);

				await createMatch(group1, group2);

				await db
					.updateTable("Group")
					.set({ status: "INACTIVE" })
					.where("id", "in", [group1, group2])
					.execute();

				await createGroup([1, 2, 3, 4]);
				await createGroup([5, 6, 7, 8]);
				await createGroup([9, 10, 11, 12]);

				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				const replayGroup = groups.find((g) => g.members === undefined);
				expect(replayGroup?.isReplay).toBe(true);
			});

			test("does not mark as replay when less than 3 members overlap", async () => {
				const group1 = await createGroup([1, 2, 3, 4]);
				const group2 = await createGroup([5, 6, 7, 8]);

				await createMatch(group1, group2);

				await db
					.updateTable("Group")
					.set({ status: "INACTIVE" })
					.where("id", "in", [group1, group2])
					.execute();

				await createGroup([1, 2, 3, 4]);
				await createGroup([5, 6, 9, 10]);

				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				for (const group of groups) {
					expect(group.isReplay).toBe(false);
				}
			});

			test("all groups have isReplay false when no recent matches", async () => {
				await createGroup([1]);
				await createGroup([2]);
				await createGroup([3]);
				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				for (const group of groups) {
					expect(group.isReplay).toBe(false);
				}
			});

			test("non-full groups do not have isReplay even with 3+ overlapping members", async () => {
				const group1 = await createGroup([1, 2, 3, 4]);
				const group2 = await createGroup([5, 6, 7, 8]);

				await createMatch(group1, group2);

				await db
					.updateTable("Group")
					.set({ status: "INACTIVE" })
					.where("id", "in", [group1, group2])
					.execute();

				await createGroup([1]);
				await createGroup([5, 6, 7]);

				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				const partialGroup = groups.find((g) =>
					g.members?.some((m) => m.id === 5),
				);
				expect(partialGroup?.isReplay).toBe(false);
			});
		});

		describe("censoring", () => {
			beforeEach(async () => {
				await dbInsertUsers(12);
			});

			afterEach(() => {
				dbReset();
			});

			test("full groups have members undefined", async () => {
				await createGroup([1, 2, 3, 4]);
				await createGroup([5, 6, 7, 8]);
				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				const fullGroup = groups.find((g) => g.members === undefined);
				expect(fullGroup).toBeDefined();
			});

			test("partial groups have members visible", async () => {
				await createGroup([1]);
				await createGroup([2, 3]);
				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				const partialGroup = groups.find((g) => g.members?.length === 2);
				expect(partialGroup).toBeDefined();
				expect(partialGroup?.members).toHaveLength(2);
			});

			test("inviteCode and chatCode removed from all groups", async () => {
				await createGroup([1]);
				await createGroup([2]);
				await createGroup([3, 4, 5, 6]);
				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				for (const group of groups) {
					expect(group).not.toHaveProperty("inviteCode");
					expect(group).not.toHaveProperty("chatCode");
				}
			});
		});

		describe("private note sorting", () => {
			beforeEach(async () => {
				await dbInsertUsers(8);
			});

			afterEach(() => {
				dbReset();
			});

			test("users with positive note sorted first", async () => {
				await createGroup([1]);
				await createGroup([2]);
				await createGroup([3]);
				await createGroup([4]);
				await createGroup([5]);
				await createGroup([6, 7]);
				await createGroup([8]);

				await createPrivateNote(1, 5, "POSITIVE");

				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				expect(groups[0].members![0].id).toBe(5);
			});

			test("users with negative note sorted last", async () => {
				await createGroup([1]);
				await createGroup([2]);
				await createGroup([3]);
				await createGroup([4]);
				await createGroup([5]);
				await createGroup([6, 7]);
				await createGroup([8]);

				await createPrivateNote(1, 5, "NEGATIVE");

				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				expect(groups[groups.length - 1].members![0].id).toBe(5);
			});

			test("group with both negative and positive sentiment sorted last", async () => {
				await createGroup([1]);
				await createGroup([2]);
				await createGroup([3]);
				await createGroup([4]);
				await createGroup([5]);
				await createGroup([6, 7]);
				await createGroup([8]);

				await createPrivateNote(1, 6, "POSITIVE");
				await createPrivateNote(1, 7, "NEGATIVE");

				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				expect(groups[groups.length - 1].members?.some((m) => m.id === 6)).toBe(
					true,
				);
			});
		});

		describe("skill-based sorting", () => {
			beforeEach(async () => {
				await dbInsertUsers(10);
			});

			afterEach(() => {
				dbReset();
			});

			test("sentiment still takes priority over skill", async () => {
				await insertSkill(1, 1000);
				await insertSkill(2, 500);
				await insertSkill(4, 2000);

				await createGroup([1]);
				await createGroup([2]);
				await createGroup([4]);

				await createPrivateNote(1, 4, "POSITIVE");

				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				expect(groups[0].members![0].id).toBe(4);
			});

			test("groups with closer skill sorted first within same sentiment", async () => {
				await insertSkill(1, 1000);
				await insertSkill(2, 1050);
				await insertSkill(3, 500);
				await insertSkill(4, 2000);

				await createGroup([1]);
				await createGroup([2]);
				await createGroup([3]);
				await createGroup([4]);

				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				expect(groups[0].members![0].id).toBe(2);
			});

			test("full groups sorted by average skill", async () => {
				await insertSkill(1, 1000);
				await insertSkill(2, 1000);
				await insertSkill(3, 1000);
				await insertSkill(4, 1000);
				await insertSkill(5, 1100);
				await insertSkill(6, 1100);
				await insertSkill(7, 1100);
				await insertSkill(8, 1100);
				await insertSkill(9, 500);
				await insertSkill(10, 500);

				await createGroup([1, 2, 3, 4]);
				const closerGroup = await createGroup([5, 6, 7, 8]);
				await createGroup([9, 10]);

				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				expect(groups.length).toBeGreaterThan(0);
				expect(groups[0].id).toBe(closerGroup);
			});

			test("newer groups sorted first when skill is equal", async () => {
				await insertSkill(1, 1000);
				await insertSkill(2, 1000);
				await insertSkill(3, 1000);

				const group1Id = await createGroup([2]);
				await new Promise((resolve) => setTimeout(resolve, 10));
				const group2Id = await createGroup([3]);

				const currentTimeInSeconds = Math.floor(Date.now() / 1000);
				await db
					.updateTable("Group")
					.set({ latestActionAt: currentTimeInSeconds - 100 })
					.where("id", "=", group1Id)
					.execute();

				await db
					.updateTable("Group")
					.set({ latestActionAt: currentTimeInSeconds - 50 })
					.where("id", "=", group2Id)
					.execute();

				await createGroup([1]);
				await refreshSendouQInstance();

				const notes = await PrivateUserNoteRepository.byAuthorUserId(1);
				const groups = SendouQ.lookingGroups(1, notes);

				expect(groups[0].members![0].id).toBe(3);
				expect(groups[1].members![0].id).toBe(2);
			});
		});
	});
});
