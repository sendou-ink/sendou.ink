import { subSeconds } from "date-fns";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { backdate } from "~/db/seed/core/backdate";
import * as SkillFactory from "~/db/seed/factories/SkillFactory";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { UserMapModePreferences } from "~/db/tables-json";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import {
	freshUserSkills,
	refreshUserSkills,
} from "~/features/mmr/tiered.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import invariant from "~/utils/invariant";
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

/** Gives every group the same `latestActionAt` so the recency tie-breaker stays neutral even when inserts straddle a second boundary (slow CI). */
const alignLatestActionAt = async (groupIds: number[]) => {
	const at = new Date();

	for (const groupId of groupIds) {
		await backdate("Group", groupId, { latestActionAt: at });
	}
};

const inviteCodeOf = (position: number) =>
	SendouQ.findOwnGroup(users.id(position))!.inviteCode;

const preferring = (mode: ModeShort): UserMapModePreferences => ({
	modes: [{ mode, preference: "PREFER" }],
	pool: [],
});

/** Gives the user a match profile that prefers one mode and is neutral on the rest. */
const prefer = (position: number, mode: ModeShort) =>
	UserFactory.grant(users.id(position), {
		matchProfile: { mapModePreferences: preferring(mode) },
	});

/** Gives the user a match profile with a pool of stages for one mode. */
const pooling = (
	position: number,
	mode: ModeShort,
	stages: StageId[],
	preference: "PREFER" | "AVOID" = "PREFER",
) =>
	UserFactory.grant(users.id(position), {
		matchProfile: {
			mapModePreferences: {
				modes: [{ mode, preference }],
				pool: [{ mode, stages }],
			},
		},
	});

/** Puts the users in a team whose own preferences prefer one mode. */
const createTeam = (memberPositions: number[], mode: ModeShort) =>
	TeamFactory.create(
		{ memberUserIds: userIds(memberPositions) },
		{ mapModePreferences: preferring(mode) },
	);

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

		test("solo group has the same tier as the user's personal tier", async () => {
			await createSkill(1, 100);
			await createSkill(2, 90);
			await createSkill(3, 80);
			await createSkill(4, 70);
			await refreshUserSkills(1);

			await createGroup([1]);
			await refreshSendouQInstance();

			const ownGroup = SendouQ.findOwnGroup(users.id(1))!;
			const { userSkills: skills } = await freshUserSkills(1);

			expect(ownGroup.tier).toMatchObject(skills[String(users.id(1))].tier);
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

	describe("modePreferences", () => {
		beforeEach(async () => {
			await users.create(4);
		});

		test("counts each member's own preferences when the group is not a team's", async () => {
			await prefer(1, "TC");

			await createGroup([1, 2, 3, 4]);
			await refreshSendouQInstance();

			expect(SendouQ.findOwnGroup(users.id(1))!.modePreferences).toEqual([
				"TC",
			]);
		});

		test("counts the team's own preferences when the group is a team's", async () => {
			for (const position of [1, 2, 3, 4]) {
				await prefer(position, "TC");
			}
			await createTeam([1, 2, 3, 4], "RM");

			await createGroup([1, 2, 3, 4]);
			await refreshSendouQInstance();

			expect(SendouQ.findOwnGroup(users.id(1))!.modePreferences).toEqual([
				"RM",
			]);
		});

		test("counts members' own preferences when only some of them share a team", async () => {
			await prefer(1, "TC");
			await createTeam([1, 2, 3], "RM");

			await createGroup([1, 2, 3, 4]);
			await refreshSendouQInstance();

			expect(SendouQ.findOwnGroup(users.id(1))!.modePreferences).toEqual([
				"TC",
			]);
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

		test("removes inviteCode and chatRoomId from all groups", async () => {
			await createGroup([1, 2]);
			await createGroup([3, 4, 5, 6]);
			await refreshSendouQInstance();

			const groups = SendouQ.previewGroups(users.id(1));

			expect(groups).toHaveLength(2);
			for (const group of groups) {
				expect(group).not.toHaveProperty("inviteCode");
				expect(group).not.toHaveProperty("chatRoomId");
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

			test("inviteCode and chatRoomId removed from all groups", async () => {
				await createGroup([1]);
				await createGroup([2]);
				await createGroup([3, 4, 5, 6]);
				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(1));

				for (const group of groups) {
					expect(group).not.toHaveProperty("inviteCode");
					expect(group).not.toHaveProperty("chatRoomId");
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

			test("full group one sub-tier away sorted above full group six sub-tiers away", async () => {
				const mus = [
					// own group -> DIAMOND
					97, 96, 95, 94,
					// adjacent group -> PLATINUM+ (one sub-tier below own)
					93, 92, 91, 90,
					// far group -> SILVER (six sub-tiers below own)
					76, 75, 74, 73,
					// rest of the ladder so every sub-tier cutoff lands on a distinct ordinal
					99,
					98, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78, 77, 72, 71, 70,
					69, 68, 67, 66, 65, 64, 63, 62, 61, 60,
				];
				await users.create(mus.length);
				for (const [i, mu] of mus.entries()) {
					await createSkill(i + 1, mu);
				}
				await refreshUserSkills(1);

				await createGroup([1, 2, 3, 4]);
				const adjacentTierGroupId = await createGroup([5, 6, 7, 8]);
				const farTierGroupId = await createGroup([9, 10, 11, 12]);
				await alignLatestActionAt([adjacentTierGroupId, farTierGroupId]);
				await refreshSendouQInstance();

				const groups = SendouQ.lookingGroups(users.id(1));

				expect(groups).toHaveLength(2);

				const adjacentTierGroup = groups.find(
					(g) => g.id === adjacentTierGroupId,
				)!;
				const farTierGroup = groups.find((g) => g.id === farTierGroupId)!;
				expect(adjacentTierGroup.tierRange?.diff).toEqual([-1, 1]);
				expect(farTierGroup.tier).toMatchObject({
					name: "SILVER",
					isPlus: false,
				});

				expect(groups[0].id).toBe(adjacentTierGroupId);
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

	describe("mapMatch", () => {
		beforeEach(async () => {
			await users.create(8);
		});

		test("counts players with the current map in their pool as its voters", async () => {
			await pooling(1, "SZ", [1, 2]);
			await pooling(5, "SZ", [3]);

			const match = await mapMatchOn({ mode: "SZ", stageId: 1 });

			expect(match.currentMap?.voters.map((voter) => voter.id)).toEqual([
				users.id(1),
			]);
		});

		test("leaves out a pool of a mode its owner avoids", async () => {
			await pooling(1, "SZ", [1], "AVOID");

			const match = await mapMatchOn({ mode: "SZ", stageId: 1 });

			expect(match.currentMap?.voters).toEqual([]);
		});

		test("counts a team's group on the team's pool rather than its members' own", async () => {
			await TeamFactory.create(
				{ memberUserIds: userIds([1, 2, 3, 4]) },
				{
					mapModePreferences: {
						modes: [{ mode: "SZ", preference: "PREFER" }],
						pool: [{ mode: "SZ", stages: [1] }],
					},
				},
			);
			await pooling(1, "SZ", [2]);

			const match = await mapMatchOn({ mode: "SZ", stageId: 1 });

			expect(match.currentMap?.voters.map((voter) => voter.id)).toEqual(
				userIds([1, 2, 3, 4]),
			);
		});

		test("shows what the concluded match did to each player's SP", async () => {
			for (const position of [1, 2, 3, 4, 5, 6, 7, 8]) {
				await createSkill(position, 25);
			}
			const { id } = await playOutMatchBetween([1, 2, 3, 4], [5, 6, 7, 8]);
			await refreshSendouQInstance();

			const match = SendouQ.mapMatch((await SQMatchRepository.findById(id))!);

			const winner = match.groupAlpha.members[0].skillDifference;
			const loser = match.groupBravo.members[0].skillDifference;
			invariant(winner?.calculated && loser?.calculated, "not calculated");

			expect(winner.spDiff).toBeGreaterThan(0);
			expect(loser.spDiff).toBeLessThan(0);
			expect(match.groupAlpha.skillDifference?.calculated).toBe(false);
		});

		test("shows the tiers snapshotted when the match was made", async () => {
			const match = await mapMatchOn({ mode: "SZ", stageId: 1 });

			expect(match.groupAlpha.tier).toEqual({ name: "GOLD", isPlus: false });
			expect(match.groupAlpha.members[0].tier).toEqual({
				name: "GOLD",
				isPlus: false,
			});
		});
	});
});

/** The match page's view of a match played on one known map, its first four users against the rest. */
const mapMatchOn = async (map: { mode: ModeShort; stageId: StageId }) => {
	const { id } = await SQMatchFactory.create({
		alphaUserIds: userIds([1, 2, 3, 4]),
		bravoUserIds: userIds([5, 6, 7, 8]),
		mapList: [{ ...map, source: "BOTH" }],
	});
	await refreshSendouQInstance();

	const match = await SQMatchRepository.findById(id);
	invariant(match, "Match not found");

	return SendouQ.mapMatch(match);
};

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
