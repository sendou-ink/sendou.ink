import { beforeEach, describe, expect, test } from "vitest";
import * as ApiTokenFactory from "~/db/seed/factories/ApiTokenFactory";
import * as BadgeFactory from "~/db/seed/factories/BadgeFactory";
import * as BuildFactory from "~/db/seed/factories/BuildFactory";
import * as PlusSuggestionFactory from "~/db/seed/factories/PlusSuggestionFactory";
import * as PlusVoteFactory from "~/db/seed/factories/PlusVoteFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as TournamentStreamerFactory from "~/db/seed/factories/TournamentStreamerFactory";
import * as TrophyFactory from "~/db/seed/factories/TrophyFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as ApiRepository from "~/features/api/ApiRepository.server";
import { lastCompletedVoting } from "~/features/plus-voting/core/voting-time";
import * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import {
	PLUS_DOWNVOTE,
	PLUS_UPVOTE,
} from "~/features/plus-voting/plus-voting-constants";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import * as AdminRepository from "./AdminRepository.server";

const users = UserFactory.pool();

// the ban log records who banned by their Discord id
const createUsers = (count: number) =>
	users.create(count, (index) => ({ discordId: String(index) }));

describe("migrate", () => {
	let oldUserId: number;
	let newUserId: number;

	beforeEach(async () => {
		oldUserId = (await UserFactory.create()).id;
		newUserId = (await UserFactory.create()).id;
	});

	const insertOwnership = async (args: {
		trophyId: number;
		tournamentId: number;
		userId: number;
	}) => {
		// biome-ignore lint/plugin: awarding a trophy requires playing out a whole tournament; migrate only cares that the rows exist
		await db.insertInto("TrophyOwner").values(args).execute();
		// biome-ignore lint/plugin: special trophies are synced from X rank placements; migrate only cares that the rows exist
		await db
			.insertInto("SpecialTrophyOwner")
			.values({
				trophyId: args.trophyId,
				userId: args.userId,
				createdAt: databaseTimestampNow(),
			})
			.execute();
	};

	const createPendingWithApprovals = async (args: {
		submitterUserId: number;
		managerId: number;
		approverUserIds: number[];
	}) => {
		const organization = await TournamentOrganizationFactory.create({
			ownerId: oldUserId,
		});

		return TrophyFactory.createPending(
			{
				organizationId: organization.id,
				submitterUserId: args.submitterUserId,
				managerId: args.managerId,
			},
			{ approverUserIds: args.approverUserIds },
		);
	};

	test("re-points trophy data to the remaining user", async () => {
		const trophy = await TrophyFactory.create({
			creatorId: newUserId,
			managerId: newUserId,
		});
		const tournament = await TournamentFactory.create({ authorId: oldUserId });
		await insertOwnership({
			trophyId: trophy.id,
			tournamentId: tournament.id,
			userId: newUserId,
		});
		await createPendingWithApprovals({
			submitterUserId: newUserId,
			managerId: newUserId,
			approverUserIds: [newUserId],
		});

		expect(await AdminRepository.migrate({ newUserId, oldUserId })).toBe(null);

		const migrated = await db
			.selectFrom("Trophy")
			.select(["creatorId", "managerId"])
			.where("id", "=", trophy.id)
			.executeTakeFirstOrThrow();
		expect(migrated).toEqual({
			creatorId: oldUserId,
			managerId: oldUserId,
		});

		expect(
			await db.selectFrom("TrophyOwner").select("userId").execute(),
		).toEqual([{ userId: oldUserId }]);
		expect(
			await db.selectFrom("SpecialTrophyOwner").select("userId").execute(),
		).toEqual([{ userId: oldUserId }]);

		const pending = await db
			.selectFrom("PendingTrophy")
			.select(["submitterUserId", "managerId"])
			.executeTakeFirstOrThrow();
		expect(pending).toEqual({
			submitterUserId: oldUserId,
			managerId: oldUserId,
		});

		expect(
			await db.selectFrom("PendingTrophyApproval").select("userId").execute(),
		).toEqual([{ userId: oldUserId }]);
	});

	test("drops the migrated account's duplicate rows when both accounts own the same trophy", async () => {
		const trophy = await TrophyFactory.create({
			creatorId: oldUserId,
			managerId: oldUserId,
		});
		const tournament = await TournamentFactory.create({ authorId: oldUserId });
		for (const userId of [oldUserId, newUserId]) {
			await insertOwnership({
				trophyId: trophy.id,
				tournamentId: tournament.id,
				userId,
			});
		}
		await createPendingWithApprovals({
			submitterUserId: oldUserId,
			managerId: oldUserId,
			approverUserIds: [oldUserId, newUserId],
		});

		expect(await AdminRepository.migrate({ newUserId, oldUserId })).toBe(null);

		expect(
			await db.selectFrom("TrophyOwner").select("userId").execute(),
		).toEqual([{ userId: oldUserId }]);
		expect(
			await db.selectFrom("SpecialTrophyOwner").select("userId").execute(),
		).toEqual([{ userId: oldUserId }]);
		expect(
			await db.selectFrom("PendingTrophyApproval").select("userId").execute(),
		).toEqual([{ userId: oldUserId }]);
	});

	test("re-points badge and streamer data to the remaining user", async () => {
		const badge = await BadgeFactory.create(
			{ authorId: newUserId },
			{ ownerIds: [newUserId], managerIds: [newUserId] },
		);
		const tournament = await TournamentFactory.create({ authorId: oldUserId });
		await TournamentStreamerFactory.create({
			tournamentId: tournament.id,
			userId: newUserId,
		});

		expect(await AdminRepository.migrate({ newUserId, oldUserId })).toBe(null);

		expect(
			await db
				.selectFrom("Badge")
				.select("authorId")
				.where("id", "=", badge.id)
				.executeTakeFirstOrThrow(),
		).toEqual({ authorId: oldUserId });
		expect(
			await db.selectFrom("BadgeManager").select("userId").execute(),
		).toEqual([{ userId: oldUserId }]);
		expect(
			await db
				.selectFrom("TournamentBadgeOwner")
				.select(["userId", "count"])
				.execute(),
		).toEqual([{ userId: oldUserId, count: 1 }]);
		expect(
			await db.selectFrom("TournamentStreamer").select("userId").execute(),
		).toEqual([{ userId: oldUserId }]);
	});

	test("merges badge grants and drops duplicate manager rows when both accounts have the same badge", async () => {
		await BadgeFactory.create(null, {
			ownerIds: [oldUserId, newUserId, newUserId],
			managerIds: [oldUserId, newUserId],
		});

		expect(await AdminRepository.migrate({ newUserId, oldUserId })).toBe(null);

		expect(
			await db.selectFrom("BadgeManager").select("userId").execute(),
		).toEqual([{ userId: oldUserId }]);
		expect(
			await db
				.selectFrom("TournamentBadgeOwner")
				.select(["userId", "count"])
				.execute(),
		).toEqual([{ userId: oldUserId, count: 3 }]);
	});
});

describe("findAllBannedUsers", () => {
	let admin: { id: number };

	const createBannedUser = (bannedReason: string, banned: 1 | Date = 1) =>
		UserFactory.create(null, {
			ban: { banned, bannedReason, bannedByUserId: admin.id },
		});

	beforeEach(async () => {
		admin = await UserFactory.create();
	});

	test("returns empty Map when no users are banned", async () => {
		await UserFactory.create();

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(0);
	});

	test("returns Map with single banned user", async () => {
		const banned = await createBannedUser("Test ban");

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(1);
		expect(result.get(banned.id)).toBeDefined();
		expect(result.get(banned.id)?.userId).toBe(banned.id);
		expect(result.get(banned.id)?.banned).toBe(1);
		expect(result.get(banned.id)?.bannedReason).toBe("Test ban");
	});

	test("returns Map with multiple banned users", async () => {
		const first = await createBannedUser("Reason 1");
		const second = await createBannedUser("Reason 2");

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(2);
		expect(result.get(first.id)?.userId).toBe(first.id);
		expect(result.get(second.id)?.userId).toBe(second.id);
	});

	test("excludes non-banned users from results", async () => {
		const banned = await createBannedUser("Test ban");
		const [other, another] = await UserFactory.createMany(2);

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(1);
		expect(result.get(banned.id)).toBeDefined();
		expect(result.get(other.id)).toBeUndefined();
		expect(result.get(another.id)).toBeUndefined();
	});

	test("includes both permanently and temporarily banned users", async () => {
		const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

		const permanent = await createBannedUser("Permanent ban");
		const temporary = await createBannedUser("Temporary ban", futureDate);

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(2);
		expect(result.get(permanent.id)?.banned).toBe(1);
		expect(result.get(temporary.id)?.banned).toBeGreaterThan(1);
	});
});

describe("banUser", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	test("permanently bans user (banned = 1)", async () => {
		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "Test permanent ban",
			bannedByUserId: users.id(2),
		});

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.get(users.id(1))?.banned).toBe(1);
		expect(result.get(users.id(1))?.bannedReason).toBe("Test permanent ban");
	});

	test("temporarily bans user (banned = Date)", async () => {
		const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

		await AdminRepository.banUser({
			userId: users.id(1),
			banned: futureDate,
			bannedReason: "Test temporary ban",
			bannedByUserId: users.id(2),
		});

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.get(users.id(1))?.banned).toBeGreaterThan(1);
		expect(result.get(users.id(1))?.bannedReason).toBe("Test temporary ban");
	});

	test("sets bannedReason correctly", async () => {
		const reason = "Violating terms of service";

		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: reason,
			bannedByUserId: users.id(2),
		});

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.get(users.id(1))?.bannedReason).toBe(reason);
	});

	test("creates BanLog entry when bannedByUserId is provided", async () => {
		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "Test ban",
			bannedByUserId: users.id(2),
		});

		const modInfo = await UserRepository.findModInfoById(users.id(1));

		expect(modInfo?.banLogs).toHaveLength(1);
		expect(modInfo?.banLogs[0].banned).toBe(1);
		expect(modInfo?.banLogs[0].bannedReason).toBe("Test ban");
		expect(modInfo?.banLogs[0].id).toBe(users.id(2));
	});

	test("does not create BanLog when bannedByUserId is null (automatic ban)", async () => {
		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "Automatic ban",
			bannedByUserId: null,
		});

		const modInfo = await UserRepository.findModInfoById(users.id(1));

		expect(modInfo?.banLogs).toHaveLength(0);
	});

	test("updates existing user correctly", async () => {
		const bannedUsers = await AdminRepository.findAllBannedUsers();
		expect(bannedUsers.size).toBe(0);

		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "First ban",
			bannedByUserId: users.id(2),
		});

		let result = await AdminRepository.findAllBannedUsers();
		expect(result.size).toBe(1);

		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "Updated ban reason",
			bannedByUserId: users.id(2),
		});

		result = await AdminRepository.findAllBannedUsers();
		expect(result.size).toBe(1);
		expect(result.get(users.id(1))?.bannedReason).toBe("Updated ban reason");

		const modInfo = await UserRepository.findModInfoById(users.id(1));
		expect(modInfo?.banLogs).toHaveLength(2);
		expect(modInfo?.banLogs[0].bannedReason).toBe("First ban");
		expect(modInfo?.banLogs[1].bannedReason).toBe("Updated ban reason");
	});

	test("revokes the banned user's API tokens", async () => {
		await ApiTokenFactory.create({ userId: users.id(1), type: "read" });
		await ApiTokenFactory.create({ userId: users.id(1), type: "write" });
		await ApiTokenFactory.create({ userId: users.id(2), type: "read" });

		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "Test ban",
			bannedByUserId: users.id(2),
		});

		expect(
			await ApiRepository.findTokenByUserId(users.id(1), "read"),
		).toBeUndefined();
		expect(
			await ApiRepository.findTokenByUserId(users.id(1), "write"),
		).toBeUndefined();
		expect(
			await ApiRepository.findTokenByUserId(users.id(2), "read"),
		).toBeDefined();
	});
});

describe("unbanUser", () => {
	let banner: { id: number };
	let unbanner: { id: number };

	const createBannedUser = (bannedReason: string, banned: 1 | Date = 1) =>
		UserFactory.create(null, {
			ban: { banned, bannedReason, bannedByUserId: banner.id },
		});

	beforeEach(async () => {
		// the unban log records who unbanned by their Discord id
		banner = await UserFactory.create({ discordId: "1" });
		unbanner = await UserFactory.create({ discordId: "2" });
	});

	test("unbans a previously banned user", async () => {
		const banned = await createBannedUser("Test ban");

		let result = await AdminRepository.findAllBannedUsers();
		expect(result.size).toBe(1);

		await AdminRepository.unbanUser({
			userId: banned.id,
			unbannedByUserId: unbanner.id,
		});

		result = await AdminRepository.findAllBannedUsers();
		expect(result.size).toBe(0);
	});

	test("creates BanLog entry with correct unbannedByUserId", async () => {
		const banned = await createBannedUser("Test ban");

		await AdminRepository.unbanUser({
			userId: banned.id,
			unbannedByUserId: unbanner.id,
		});

		const modInfo = await UserRepository.findModInfoById(banned.id);

		expect(modInfo?.banLogs).toHaveLength(2);

		const unbanLog = modInfo?.banLogs.find((log) => log.banned === 0);
		expect(unbanLog).toBeDefined();
		expect(unbanLog?.bannedReason).toBeNull();
		expect(unbanLog?.id).toBe(unbanner.id);
	});

	test("can unban permanently banned user", async () => {
		const banned = await createBannedUser("Permanent ban");

		await AdminRepository.unbanUser({
			userId: banned.id,
			unbannedByUserId: unbanner.id,
		});

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(0);
	});

	test("can unban temporarily banned user", async () => {
		const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

		const banned = await createBannedUser("Temporary ban", futureDate);

		await AdminRepository.unbanUser({
			userId: banned.id,
			unbannedByUserId: unbanner.id,
		});

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(0);
	});
});

describe("replacePlusTiers", () => {
	// tier * 2 + 1, so tier 1 is 3 and the tier 4 users default to is 9
	const TIER_1_SORT_VALUE = 3;
	const NO_TIER_SORT_VALUE = 9;
	const SPLATTERSHOT = 40;

	const createBuild = (ownerId: number) =>
		BuildFactory.create({
			ownerId,
			weaponSplIds: [SPLATTERSHOT],
			isPrivate: 0,
		});

	const sortValueByBuildId = async (buildId: number) => {
		const buildWeapon = await db
			.selectFrom("BuildWeapon")
			.select("sortValue")
			.where("buildId", "=", buildId)
			.executeTakeFirstOrThrow();

		return buildWeapon.sortValue;
	};

	beforeEach(async () => {
		await createUsers(4);
	});

	const SUGGESTED_TIER = 2;
	const suggestedId = () => users.id(1);
	const voterIds = () => users.ids().slice(1);

	const suggest = () =>
		PlusSuggestionFactory.create({
			authorId: voterIds()[0],
			suggestedId: suggestedId(),
			tier: SUGGESTED_TIER,
			...lastCompletedVoting(new Date()),
		});

	const voteOnSuggested = (score: number) =>
		PlusVoteFactory.createMany(voterIds().length, (index) => ({
			authorId: voterIds()[index],
			votedId: suggestedId(),
			tier: SUGGESTED_TIER,
			score,
		}));

	const everyoneInTier = (plusTier: number) =>
		users.ids().map((userId) => ({ userId, plusTier }));

	const suggestionCount = async () => {
		const rows = await db.selectFrom("PlusSuggestion").select("id").execute();

		return rows.length;
	};

	test("deletes the suggestion of a user given the tier before the voting, so failing it demotes them instead of removing them", async () => {
		await suggest();
		await AdminRepository.replacePlusTiers(everyoneInTier(SUGGESTED_TIER));
		await voteOnSuggested(PLUS_DOWNVOTE);

		expect(await suggestionCount()).toBe(0);
		expect(
			await PlusVotingRepository.findAllPlusTiersFromLatestVoting(),
		).toContainEqual({ userId: suggestedId(), plusTier: SUGGESTED_TIER + 1 });
	});

	test.each([
		{ why: "above the suggested tier", plusTier: 1, expectedCount: 0 },
		{ why: "in the suggested tier", plusTier: 2, expectedCount: 0 },
		{ why: "below the suggested tier", plusTier: 3, expectedCount: 1 },
		{ why: "without a tier", plusTier: null, expectedCount: 1 },
	])(
		"leaves $expectedCount suggestions of a user the new tiers put $why",
		async ({ plusTier, expectedCount }) => {
			await suggest();
			await AdminRepository.replacePlusTiers([
				...everyoneInTier(SUGGESTED_TIER).filter(
					({ userId }) => userId !== suggestedId(),
				),
				...(plusTier ? [{ userId: suggestedId(), plusTier }] : []),
			]);

			expect(await suggestionCount()).toBe(expectedCount);
		},
	);

	test("deletes the suggestion of a member when only an earlier voting has votes", async () => {
		await PlusVoteFactory.create({
			authorId: voterIds()[0],
			votedId: voterIds()[1],
			month: 0,
			year: 2020,
		});
		await suggest();
		await AdminRepository.replacePlusTiers(everyoneInTier(SUGGESTED_TIER));

		expect(await suggestionCount()).toBe(0);
	});

	test("keeps the suggestion of a user who passed a voting already cast", async () => {
		await suggest();
		await voteOnSuggested(PLUS_UPVOTE);
		await AdminRepository.replacePlusTiers(everyoneInTier(SUGGESTED_TIER));

		expect(await suggestionCount()).toBe(1);
	});

	test("refreshes the sort values of the builds a new tier applies to", async () => {
		const build = await createBuild(users.id(1));

		expect(await sortValueByBuildId(build.id)).toBe(NO_TIER_SORT_VALUE);

		await AdminRepository.replacePlusTiers([
			{ userId: users.id(1), plusTier: 1 },
		]);

		expect(await sortValueByBuildId(build.id)).toBe(TIER_1_SORT_VALUE);
	});

	test("refreshes the sort values of the builds of a user left out of the new tiers", async () => {
		await AdminRepository.replacePlusTiers([
			{ userId: users.id(1), plusTier: 1 },
		]);
		const build = await createBuild(users.id(1));

		expect(await sortValueByBuildId(build.id)).toBe(TIER_1_SORT_VALUE);

		await AdminRepository.replacePlusTiers([
			{ userId: users.id(2), plusTier: 1 },
		]);

		expect(await sortValueByBuildId(build.id)).toBe(NO_TIER_SORT_VALUE);
	});
});
