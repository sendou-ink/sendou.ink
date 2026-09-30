import { describe, expect, test } from "vitest";
import type { FriendActivityType } from "~/features/friends/friends-constants";
import { orderSidebarFriends } from "./sidebar.server";

describe("orderSidebarFriends", () => {
	test("ranks pinned active, active, pinned idle and idle in that order", () => {
		const ordered = orderSidebarFriends([
			entry("idle"),
			entry("pinnedIdle", { isPinned: true }),
			entry("active", { activityType: "SENDOUQ_MATCH" }),
			entry("pinnedActive", {
				isPinned: true,
				activityType: "SENDOUQ_MATCH",
			}),
		]);

		expect(idsOf(ordered)).toEqual([
			"pinnedActive",
			"active",
			"pinnedIdle",
			"idle",
		]);
	});

	test("keeps the activity quotas in order within a section", () => {
		const ordered = orderSidebarFriends([
			entry("q1", { activityType: "SENDOUQ" }),
			entry("q2", { activityType: "SENDOUQ" }),
			entry("q3", { activityType: "SENDOUQ" }),
			entry("sub1", { activityType: "TOURNAMENT_SUB" }),
			entry("sub2", { activityType: "TOURNAMENT_SUB" }),
			entry("sub3", { activityType: "TOURNAMENT_SUB" }),
			entry("match", { activityType: "SENDOUQ_MATCH" }),
		]);

		expect(idsOf(ordered)).toEqual([
			"q1",
			"q2",
			"sub1",
			"sub2",
			"q3",
			"sub3",
			"match",
		]);
	});

	test("pinning a friend does not disturb the quota order of the rest", () => {
		const ordered = orderSidebarFriends([
			entry("q1", { activityType: "SENDOUQ" }),
			entry("q2", { activityType: "SENDOUQ" }),
			entry("q3", { activityType: "SENDOUQ", isPinned: true }),
			entry("sub1", { activityType: "TOURNAMENT_SUB" }),
		]);

		expect(idsOf(ordered)).toEqual(["q3", "q1", "q2", "sub1"]);
	});

	test("shows a pinned friend that would otherwise fall past the visible quota", () => {
		const ordered = orderSidebarFriends([
			...Array.from({ length: 10 }, (_, i) => entry(`idle${i}`)),
			entry("pinned", { isPinned: true }),
		]);

		expect(ordered).toHaveLength(8);
		expect(idsOf(ordered)[0]).toBe("pinned");
	});

	test("drops active friends past the visible quota", () => {
		const ordered = orderSidebarFriends(
			Array.from({ length: 12 }, (_, i) =>
				entry(`match${i}`, { activityType: "TOURNAMENT_MATCH" }),
			),
		);

		expect(idsOf(ordered)).toEqual([
			"match0",
			"match1",
			"match2",
			"match3",
			"match4",
			"match5",
			"match6",
			"match7",
		]);
	});

	test("places friends before team members sharing their activity", () => {
		const ordered = orderSidebarFriends([
			entry("teamMember", {
				isFriend: false,
				activityType: "SENDOUQ_MATCH",
			}),
			entry("friend", { activityType: "SENDOUQ_MATCH" }),
		]);

		expect(idsOf(ordered)).toEqual(["friend", "teamMember"]);
	});

	test("ranks an active team member above an idle friend", () => {
		const ordered = orderSidebarFriends([
			entry("idleFriend"),
			entry("activeTeamMember", {
				isFriend: false,
				activityType: "SENDOUQ",
			}),
		]);

		expect(idsOf(ordered)).toEqual(["activeTeamMember", "idleFriend"]);
	});
});

function entry(
	id: string,
	{
		isFriend = true,
		isPinned = false,
		activityType = null,
	}: {
		isFriend?: boolean;
		isPinned?: boolean;
		activityType?: FriendActivityType | null;
	} = {},
) {
	return { id, isFriend, isPinned, activityType };
}

function idsOf(entries: Array<{ id: string }>) {
	return entries.map(({ id }) => id);
}
