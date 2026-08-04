import { subSeconds } from "date-fns";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { backdate } from "~/db/seed/core/backdate";
import * as SkillFactory from "~/db/seed/factories/SkillFactory";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import { refreshUserSkills } from "~/features/mmr/tiered.server";
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

/** Users are interchangeable here, so tests name them by 1-based position. */
const users = UserFactory.pool();

const userIds = (positions: number[]) =>
	positions.map((position) => users.id(position));

const createGroup = async (
	memberPositions: number[],
	options: {
		status?: "PREPARING" | "ACTIVE";
	} = {},
) => {
	const group = await SQGroupFactory.create({
		status: options.status ?? "ACTIVE",
		memberUserIds: userIds(memberPositions),
	});

	return group.id;
};

/**
 * Gives every group the same `latestActionAt`, so the sort comparator's recency
 * tie-breaker stays neutral and the assertion does not depend on whether the group
 * inserts straddle a second boundary (which they can on slow CI).
 */
const alignLatestActionAt = async (groupIds: number[]) => {
	const at = new Date();

	for (const groupId of groupIds) {
		await backdate("Group", groupId, { latestActionAt: at });
	}
};

const inviteCodeOf = (position: number) =>
	SendouQ.findOwnGroup(users.id(position))!.inviteCode;

/** Ranks a user: a higher `mu` is a higher ordinal, and with it a higher tier. */
const createSkill = (position: number, mu: number) =>
	SkillFactory.create(
		{ userId: users.id(position), mu },
		{ matchesCount: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD },
	);

describe("SendouQ", () => {
	describe("currentViewByUserId", () => {
		beforeEach(async () => {
			await users.create(8);
		});

		test("returns 'default' when user not in any group", async () => {
			await refreshSendouQInstance();

			const view = SendouQ.currentViewByUserId(users.id(1));

			expect(view).toBe("default");
		});

		test("returns 'preparing' when user in PREPARING group", async () => {
			await createGroup([1], { status: "PREPARING" });
			await refreshSendouQInstance();

			const view = SendouQ.currentViewByUserId(users.id(1));

			expect(view).toBe("preparing");
		});

		test("returns 'match' when user in ACTIVE group with matchId", async () => {
			await SQMatchFactory.create({
				alphaUserIds: userIds([1, 2, 3, 4]),
				bravoUserIds: userIds([5, 6, 7, 8]),
			});

			await refreshSendouQInstance();

			const view = SendouQ.currentViewByUserId(users.id(1));

			expect(view).toBe("match");
		});

		test("returns 'looking' when user in ACTIVE group without matchId", async () => {
			await createGroup([1], { status: "ACTIVE" });
			await refreshSendouQInstance();

			const view = SendouQ.currentViewByUserId(users.id(1));

			expect(view).toBe("looking");
		});
	});

	describe("findOwnGroup", () => {
		beforeEach(async () => {
			await users.create(8);
		});

		test("returns group when user is a member", async () => {
			await createGroup([1, 2, 3]);
			await refreshSendouQInstance();

			const group = SendouQ.findOwnGroup(users.id(1));

			expect(group).toBeDefined();
			expect(group?.members.some((m) => m.id === users.id(1))).toBe(true);
		});

		test("returns undefined when user not in any group", async () => {
			await createGroup([1, 2, 3]);
			await refreshSendouQInstance();

			const group = SendouQ.findOwnGroup(users.id(4));

			expect(group).toBeUndefined();
		});

		test("returns group with correct role when user is OWNER", async () => {
			await createGroup([1, 2]);
			await refreshSendouQInstance();

			const group = SendouQ.findOwnGroup(users.id(1));

			expect(group).toBeDefined();
			const member = group?.members.find((m) => m.id === users.id(1));
			expect(member?.role).toBe("OWNER");
		});

		test("returns group with correct role when user is REGULAR member", async () => {
			await createGroup([1, 2]);
			await refreshSendouQInstance();

			const group = SendouQ.findOwnGroup(users.id(2));

			expect(group).toBeDefined();
			const member = group?.members.find((m) => m.id === users.id(2));
			expect(member?.role).toBe("REGULAR");
		});

		test("returns correct group when multiple groups exist", async () => {
			await createGroup([1, 2]);
			await createGroup([3, 4]);
			await createGroup([5, 6]);
			await refreshSendouQInstance();

			const group = SendouQ.findOwnGroup(users.id(5));

			expect(group).toBeDefined();
			expect(group?.members.some((m) => m.id === users.id(5))).toBe(true);
			expect(group?.members.some((m) => m.id === users.id(1))).toBe(false);
		});
	});

	describe("findGroupByInviteCode", () => {
		beforeEach(async () => {
			await users.create(4);
		});

		test("returns group when invite code is valid", async () => {
			await createGroup([1]);
			await refreshSendouQInstance();

			const group = SendouQ.findGroupByInviteCode(inviteCodeOf(1));

			expect(group).toBeDefined();
			expect(group?.inviteCode).toBe(inviteCodeOf(1));
		});

		test("returns undefined when invite code is invalid", async () => {
			await createGroup([1]);
			await refreshSendouQInstance();

			const group = SendouQ.findGroupByInviteCode("INVALID");

			expect(group).toBeUndefined();
		});

		test("returns correct group when multiple groups exist", async () => {
			await createGroup([1]);
			await createGroup([2]);
			await createGroup([3]);
			await refreshSendouQInstance();

			const group = SendouQ.findGroupByInviteCode(inviteCodeOf(2));

			expect(group).toBeDefined();
			expect(group?.members[0].id).toBe(users.id(2));
		});
	});

	describe("previewGroups", () => {
		beforeEach(async () => {
			await users.create(12);
		});

		test("returns empty array when no groups exist", async () => {
			await refreshSendouQInstance();

			const groups = SendouQ.previewGroups(users.id(1));

			expect(groups).toEqual([]);
		});

		test("censors members for full groups", async () => {
			await createGroup([1, 2, 3, 4]);
			await refreshSendouQInstance();

			const groups = SendouQ.previewGroups(users.id(1));

			expect(groups).toHaveLength(1);
			expect(groups[0].members).toBeUndefined();
		});

		test("shows members for partial groups", async () => {
			await createGroup([1, 2]);
			await refreshSendouQInstance();

			const groups = SendouQ.previewGroups(users.id(1));

			expect(groups).toHaveLength(1);
			expect(groups[0].members).toBeDefined();
			expect(groups[0].members).toHaveLength(2);
		});

		test("removes inviteCode and chatCode from all groups", async () => {
			await createGroup([1, 2]);
			await createGroup([3, 4, 5, 6]);
			await refreshSendouQInstance();

			const groups = SendouQ.previewGroups(users.id(1));

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

			const groups = SendouQ.previewGroups(users.id(1));

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

			const groups = SendouQ.previewGroups(users.id(1));

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
			beforeEach(async () => {
				await refreshUserSkills(1);
			});

			test("sorts full groups by tier when viewer has a tier", async () => {
				await createSkill(1, 1000);
				await createSkill(2, 500);
				await createSkill(3, 500);
				await createSkill(4, 500);
				await createSkill(5, 500);
				await createSkill(6, 2000);
				await createSkill(7, 2000);
				await createSkill(8, 2000);
				await createSkill(9, 2000);

				const group1Id = await createGroup([2, 3, 4, 5]);
				const group2Id = await createGroup([6, 7, 8, 9]);
				await alignLatestActionAt([group1Id, group2Id]);
				await refreshSendouQInstance();

				const groups = SendouQ.previewGroups(users.id(1));

				expect(groups).toHaveLength(2);
				expect(groups[0].id).toBe(group1Id);
				expect(groups[1].id).toBe(group2Id);
			});

			test("sorts partial groups by tier relative to viewer", async () => {
				await createSkill(1, 1000);
				await createSkill(2, 500);
				await createSkill(3, 2000);
				await createSkill(4, 1050);

				const g4Id = await createGroup([4]);
				const g2Id = await createGroup([2]);
				const g3Id = await createGroup([3]);
				await alignLatestActionAt([g4Id, g2Id, g3Id]);
				await refreshSendouQInstance();

				const groups = SendouQ.previewGroups(users.id(1));

				expect(groups).toHaveLength(3);
				expect(groups[0].members![0].id).toBe(users.id(4));
				expect(groups[1].members![0].id).toBe(users.id(2));
				expect(groups[2].members![0].id).toBe(users.id(3));
			});

			test("full groups are sorted last regardless of tier", async () => {
				await createSkill(1, 1000);
				await createSkill(2, 1100);
				await createSkill(3, 1100);
				await createSkill(4, 1100);
				await createSkill(5, 1100);
				await createSkill(6, 500);

				const fullGroupId = await createGroup([2, 3, 4, 5]);
				const partialGroupId = await createGroup([6]);
				await refreshSendouQInstance();

				const groups = SendouQ.previewGroups(users.id(1));

				expect(groups).toHaveLength(2);
				expect(groups[0].id).toBe(partialGroupId);
				expect(groups[1].id).toBe(fullGroupId);
			});

			test("handles viewer without skill gracefully", async () => {
				await createSkill(2, 500);
				await createSkill(3, 2000);

				await createGroup([2]);
				await createGroup([3]);
				await refreshSendouQInstance();

				const groups = SendouQ.previewGroups(users.id(1));

				expect(groups).toHaveLength(2);
			});
		});
	});

	describe("lookingGroups", () => {
		describe("filtering", () => {
			beforeEach(async () => {
				await users.create(20);
			});

			test("returns empty array when user not in a group", async () => {
				await createGroup([1, 2, 3, 4]);
				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(5));

				expect(groups).toEqual([]);
			});

			test("only returns ACTIVE groups", async () => {
				await createGroup([1]);
				await createGroup([2], { status: "PREPARING" });
				const group3 = await createGroup([3]);
				await SQGroupRepository.setAsInactive(group3);
				await createGroup([4], { status: "ACTIVE" });
				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(1));

				expect(groups).toHaveLength(1);
				expect(groups[0].members![0].id).toBe(users.id(4));
			});

			test("only returns groups without matchId", async () => {
				await createGroup([1, 2, 3, 4]);
				await SQMatchFactory.create({
					alphaUserIds: userIds([5, 6, 7, 8]),
					bravoUserIds: userIds([9, 10, 11, 12]),
				});
				const lookingGroup = await createGroup([13, 14, 15, 16]);

				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(1));

				expect(groups).toHaveLength(1);
				expect(groups[0].id).toBe(lookingGroup);
			});

			test("excludes own group from results", async () => {
				await createGroup([1, 2]);
				await createGroup([3, 4]);
				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(1));

				expect(groups).toHaveLength(1);
				expect(groups[0].members?.some((m) => m.id === users.id(1))).toBe(
					false,
				);
			});

			test("own group size 4 only shows size 4 groups", async () => {
				await createGroup([1, 2, 3, 4]);
				await createGroup([5]);
				await createGroup([6, 7]);
				await createGroup([8, 9, 10]);
				await createGroup([11, 12, 13, 14]);
				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(1));

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

				const groups = SendouQ.lookingGroups(users.id(1));

				expect(groups).toHaveLength(1);
				expect(groups[0].members).toHaveLength(1);
				expect(groups[0].members![0].id).toBe(users.id(4));
			});

			test("own group size 2 shows size 1 and 2 groups", async () => {
				await createGroup([1, 2]);
				await createGroup([3]);
				await createGroup([4, 5]);
				await createGroup([6, 7, 8]);
				await createGroup([9, 10, 11, 12]);
				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(1));

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

				const groups = SendouQ.lookingGroups(users.id(1));

				expect(groups).toHaveLength(3);
				const groupSizes = groups.map((g) => g.members!.length);
				expect(groupSizes).toContain(1);
				expect(groupSizes).toContain(2);
				expect(groupSizes).toContain(3);
			});
		});

		describe("replay detection", () => {
			beforeEach(async () => {
				await users.create(12);
			});

			test("marks group as replay when 3+ members overlap", async () => {
				await playOutMatchBetween([1, 2, 3, 4], [5, 6, 7, 8]);

				await createGroup([1, 2, 3, 4]);
				await createGroup([5, 6, 7, 8]);
				await createGroup([9, 10, 11, 12]);

				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(1));

				const fullGroups = groups.filter((g) => g.members === undefined);
				expect(fullGroups.some((g) => g.isReplay)).toBe(true);
			});

			test("does not mark as replay when less than 3 members overlap", async () => {
				await playOutMatchBetween([1, 2, 3, 4], [5, 6, 7, 8]);

				await createGroup([1, 2, 3, 4]);
				await createGroup([5, 6, 9, 10]);

				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(1));

				for (const group of groups) {
					expect(group.isReplay).toBe(false);
				}
			});

			test("all groups have isReplay false when no recent matches", async () => {
				await createGroup([1]);
				await createGroup([2]);
				await createGroup([3]);
				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(1));

				for (const group of groups) {
					expect(group.isReplay).toBe(false);
				}
			});

			test("non-full groups do not have isReplay even with 3+ overlapping members", async () => {
				await playOutMatchBetween([1, 2, 3, 4], [5, 6, 7, 8]);

				await createGroup([1]);
				await createGroup([5, 6, 7]);

				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(1));

				const partialGroup = groups.find((g) =>
					g.members?.some((m) => m.id === users.id(5)),
				);
				expect(partialGroup?.isReplay).toBe(false);
			});
		});

		describe("censoring", () => {
			beforeEach(async () => {
				await users.create(12);
			});

			test("full groups have members undefined", async () => {
				await createGroup([1, 2, 3, 4]);
				await createGroup([5, 6, 7, 8]);
				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(1));

				const fullGroup = groups.find((g) => g.members === undefined);
				expect(fullGroup).toBeDefined();
			});

			test("partial groups have members visible", async () => {
				await createGroup([1]);
				await createGroup([2, 3]);
				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(1));

				const partialGroup = groups.find((g) => g.members?.length === 2);
				expect(partialGroup).toBeDefined();
				expect(partialGroup?.members).toHaveLength(2);
			});

			test("inviteCode and chatCode removed from all groups", async () => {
				await createGroup([1]);
				await createGroup([2]);
				await createGroup([3, 4, 5, 6]);
				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(1));

				for (const group of groups) {
					expect(group).not.toHaveProperty("inviteCode");
					expect(group).not.toHaveProperty("chatCode");
				}
			});
		});

		describe("skill-based sorting", () => {
			beforeEach(async () => {
				await refreshUserSkills(1);
				await users.create(10);
			});

			test("groups with closer skill sorted first", async () => {
				await createSkill(1, 1000);
				await createSkill(2, 1050);
				await createSkill(3, 500);
				await createSkill(4, 2000);

				await alignLatestActionAt([
					await createGroup([1]),
					await createGroup([2]),
					await createGroup([3]),
					await createGroup([4]),
				]);

				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(1));

				expect(groups[0].members![0].id).toBe(users.id(2));
			});

			test("full groups sorted by average skill", async () => {
				await createSkill(1, 1000);
				await createSkill(2, 1000);
				await createSkill(3, 1000);
				await createSkill(4, 1000);
				await createSkill(5, 1100);
				await createSkill(6, 1100);
				await createSkill(7, 1100);
				await createSkill(8, 1100);
				await createSkill(9, 500);
				await createSkill(10, 500);

				await createGroup([1, 2, 3, 4]);
				const closerGroup = await createGroup([5, 6, 7, 8]);
				await createGroup([9, 10]);

				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(1));

				expect(groups.length).toBeGreaterThan(0);
				expect(groups[0].id).toBe(closerGroup);
			});

			test("newer groups sorted first when skill is equal", async () => {
				await createSkill(1, 1000);
				await createSkill(2, 1000);
				await createSkill(3, 1000);

				const group1Id = await createGroup([2]);
				const group2Id = await createGroup([3]);

				const now = new Date();
				await backdate("Group", group1Id, {
					latestActionAt: subSeconds(now, 100),
				});
				await backdate("Group", group2Id, {
					latestActionAt: subSeconds(now, 50),
				});

				await createGroup([1]);
				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(1));

				expect(groups[0].members![0].id).toBe(users.id(3));
				expect(groups[1].members![0].id).toBe(users.id(2));
			});
		});
	});
});

/** Leaves both groups inactive with a freshly concluded match between them. */
const playOutMatchBetween = (
	alphaPositions: number[],
	bravoPositions: number[],
) =>
	SQMatchFactory.create(
		{
			alphaUserIds: userIds(alphaPositions),
			bravoUserIds: userIds(bravoPositions),
		},
		{ isConcluded: true },
	);
