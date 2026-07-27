import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import {
	assertResponseErrored,
	dbReset,
	withUserId,
	wrappedAction,
} from "~/utils/Test";
import type { adminActionSchema } from "../actions/admin.server";
import { action } from "./admin";

const adminAction = wrappedAction<typeof adminActionSchema>({ action });

const users = UserFactory.pool();

// account migration is asserted through Discord ids, so the tests give the users
// one they can name
const createUsers = (count = 2) =>
	users.create(count, (index) => ({ discordId: String(index) }));

const voteArgs = ({
	score,
	votedId,
	authorId = users.id(1),
	month = 6,
	year = 2021,
}: {
	score: number;
	votedId: number;
	authorId?: number;
	month?: number;
	year?: number;
}) => ({
	score,
	votedId,
	authorId,
	month,
	tier: 1,
	becomesValidAt: dateToDatabaseTimestamp(new Date("2021-12-11T00:00:00.000Z")),
	year,
});

const countPlusTierMembers = (tier = 1) =>
	db
		.selectFrom("PlusTier")
		.where("PlusTier.tier", "=", tier)
		.select(({ fn }) => fn.count<number>("PlusTier.tier").as("count"))
		.executeTakeFirstOrThrow()
		.then((row) => row.count);

const createLeaderboard = (userIds: number[]) =>
	db
		.insertInto("Skill")
		.values(
			userIds.map((userId, i) => ({
				matchesCount: 10,
				mu: 25,
				sigma: 8.333333333333334,
				ordinal: 0.5 - i * 0.001,
				userId,
				season: 1,
			})),
		)
		.execute();

describe("Plus voting", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(async () => {
		vi.useRealTimers();
		await dbReset();
	});

	test("gives correct amount of plus tiers", async () => {
		vi.setSystemTime(new Date("2023-12-12T00:00:00.000Z"));

		await createUsers(10);
		await PlusVotingRepository.upsertMany(
			Array.from({ length: 10 }).map((_, i) => {
				const id = i + 1;

				return voteArgs({
					score: id <= 5 ? -1 : 1,
					votedId: users.id(id),
				});
			}),
		);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers()).toBe(5);
	});

	test("60% or more guarantees pass", async () => {
		vi.setSystemTime(new Date("2023-12-12T00:00:00.000Z"));

		await createUsers(10);

		// 60% - auto-pass
		await PlusVotingRepository.upsertMany(
			Array.from({ length: 10 }).map((_, i) => {
				return voteArgs({
					authorId: users.id(i + 1),
					score: i < 4 ? -1 : 1,
					votedId: users.id(1),
				});
			}),
		);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers()).toBe(1);
	});

	test("40% or less does not pass", async () => {
		vi.setSystemTime(new Date("2023-12-12T00:00:00.000Z"));

		await createUsers(10);

		// 40% - auto-fail
		await PlusVotingRepository.upsertMany(
			Array.from({ length: 10 }).map((_, i) => {
				return voteArgs({
					authorId: users.id(i + 1),
					score: i < 6 ? -1 : 1,
					votedId: users.id(1),
				});
			}),
		);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers()).toBe(0);
	});

	test("middle zone (40-60%) passes when quota has room", async () => {
		vi.setSystemTime(new Date("2023-12-12T00:00:00.000Z"));

		await createUsers(10);

		// 50% - middle zone, should pass (quota=50 for tier 1)
		await PlusVotingRepository.upsertMany(
			Array.from({ length: 10 }).map((_, i) => {
				return voteArgs({
					authorId: users.id(i + 1),
					score: i < 5 ? -1 : 1,
					votedId: users.id(1),
				});
			}),
		);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers()).toBe(1);
	});

	test("combines leaderboard and voting results (after season over)", async () => {
		vi.setSystemTime(new Date("2023-11-29T00:00:00.000Z"));

		await createUsers();
		await PlusVotingRepository.upsertMany([
			voteArgs({
				score: 1,
				votedId: users.id(1),
			}),
		]);
		await createLeaderboard([users.id(2)]);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers()).toBe(2);
	});

	test("skips users from leaderboard with the skip flag for the season", async () => {
		vi.setSystemTime(new Date("2023-11-29T00:00:00.000Z"));

		await createUsers(11);
		await createLeaderboard(users.ids());

		await db
			.updateTable("User")
			.set({ plusSkippedForSeasonNth: 1 })
			.where("User.id", "=", users.id(1))
			.execute();

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers(1)).toBe(5);
		expect(await countPlusTierMembers(2)).toBe(5);
	});

	test("plus server skip flag ignored if for past season", async () => {
		vi.setSystemTime(new Date("2023-11-29T00:00:00.000Z"));

		await createUsers(11);
		await createLeaderboard(users.ids());

		await db
			.updateTable("User")
			.set({ plusSkippedForSeasonNth: 0 })
			.where("User.id", "=", users.id(1))
			.execute();

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers(1)).toBe(5);
		expect(await countPlusTierMembers(2)).toBe(6);
	});

	test("ignores leaderboard while season is ongoing", async () => {
		vi.setSystemTime(new Date("2024-02-15T00:00:00.000Z"));

		await createUsers();
		await PlusVotingRepository.upsertMany([
			voteArgs({
				score: 1,
				votedId: users.id(1),
			}),
		]);
		await createLeaderboard([users.id(2)]);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers()).toBe(1);
		expect(await countPlusTierMembers(2)).toBe(0);
	});

	test("leaderboard gives members to all tiers", async () => {
		vi.setSystemTime(new Date("2023-11-20T00:00:00.000Z"));

		await createUsers(60);
		await createLeaderboard(users.ids());

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers()).toBeGreaterThan(0);
		expect(await countPlusTierMembers(2)).toBeGreaterThan(0);
		expect(await countPlusTierMembers(3)).toBeGreaterThan(0);
	});

	test("gives membership if failed voting and is on the leaderboard", async () => {
		vi.setSystemTime(new Date("2023-11-29T00:00:00.000Z"));

		await createUsers(1);
		await PlusVotingRepository.upsertMany([
			voteArgs({
				score: -1,
				votedId: users.id(1),
			}),
		]);
		await createLeaderboard([users.id(1)]);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers(1)).toBe(1);
	});

	test("gives membership if failed voting and is on the leaderboard and season ended last month", async () => {
		vi.setSystemTime(new Date("2023-12-29T00:00:00.000Z"));

		await createUsers(1);
		await PlusVotingRepository.upsertMany([
			voteArgs({
				score: -1,
				votedId: users.id(1),
			}),
		]);
		await createLeaderboard([users.id(1)]);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers(1)).toBe(1);
	});

	test("members who fails voting drops one tier", async () => {
		vi.setSystemTime(new Date("2024-02-15T00:00:00.000Z"));

		await createUsers(1);
		await PlusVotingRepository.upsertMany([
			voteArgs({
				score: 1,
				votedId: users.id(1),
				month: 11,
				year: 2023,
			}),
		]);

		await PlusVotingRepository.upsertMany([
			voteArgs({
				score: -1,
				votedId: users.id(1),
				month: 2,
				year: 2024,
			}),
		]);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers(2)).toBe(1);
	});
});

const migrateUserAction = () =>
	adminAction(
		{
			_action: "MIGRATE",
			"old-user": users.id(1),
			"new-user": users.id(2),
		},
		{ user: "admin" },
	);

describe("Account migration", () => {
	beforeEach(async () => {
		await createUsers(2);
	});

	afterEach(async () => {
		await dbReset();
	});

	it("migrates a blank account", async () => {
		expect(await UserRepository.findProfileByIdentifier("0")).toBeDefined();
		expect(await UserRepository.findProfileByIdentifier("1")).toBeDefined();

		await migrateUserAction();

		const oldUser = await UserRepository.findProfileByIdentifier("0"); // these are discord ids
		const newUser = await UserRepository.findProfileByIdentifier("1");

		expect(oldUser).toBeNull();
		expect(newUser?.id).toBe(users.id(1)); // took the old user's id
	});

	it("two accounts with teams results in an error", async () => {
		await TeamRepository.insert({
			name: "Team 1",
			ownerUserId: users.id(1),
			isMainTeam: true,
		});
		await TeamRepository.insert({
			name: "Team 2",
			ownerUserId: users.id(2),
			isMainTeam: true,
		});

		const response = await migrateUserAction();

		assertResponseErrored(response, "both old and new user are in teams");
	});

	const membershipOf = (userId: number) =>
		db
			.selectFrom("AllTeamMember")
			.select(["userId"])
			.where("userId", "=", userId)
			.executeTakeFirst();

	it("deletes past team membership status of the new user", async () => {
		await TeamRepository.insert({
			name: "Team 1",
			ownerUserId: users.id(2),
			isMainTeam: true,
		});
		await TeamRepository.deleteById(1);

		const membershipBeforeMigration = await membershipOf(users.id(2));
		expect(membershipBeforeMigration).toBeDefined();

		await migrateUserAction();

		const membershipAfterMigration = await membershipOf(users.id(2));

		expect(membershipAfterMigration).toBeUndefined();
	});

	it("handles old user member of the same team as new user (old user has left the team, new user current)", async () => {
		await TeamRepository.insert({
			name: "Team 1",
			ownerUserId: users.id(2),
			isMainTeam: true,
		});
		await withUserId(users.id(1), () =>
			TeamRepository.insertOwnMembership({
				teamId: 1,
				maxTeamsAllowed: 1,
			}),
		);
		await TeamRepository.handleMemberLeaving({
			teamId: 1,
			userId: users.id(1),
		});

		for (const id of [users.id(1), users.id(2)]) {
			const membership = await membershipOf(id);
			expect(membership).toBeDefined();
		}

		await migrateUserAction();

		const membershipOldUser = await membershipOf(users.id(1));
		const membershipNewUser = await membershipOf(users.id(2));

		expect(membershipOldUser).toBeDefined();
		expect(membershipNewUser).toBeUndefined();
	});

	it("deletes weapon pool from the new user when migrating (takes weapon pool from the old user)", async () => {
		await withUserId(users.id(1), () =>
			UserRepository.updateOwnProfile({
				weapons: [{ weaponSplId: 1, isFavorite: 1 }],
			}),
		);
		await withUserId(users.id(2), () =>
			UserRepository.updateOwnProfile({
				weapons: [{ weaponSplId: 10 }],
			}),
		);

		await migrateUserAction();

		const oldUser = await UserRepository.findProfileByIdentifier("0");
		const newUser = await UserRepository.findProfileByIdentifier("1");

		expect(oldUser).toBeNull();
		expect(newUser?.weapons).toEqual([
			{ weaponSplId: 1, isFavorite: 1, isTenStar: 0 },
		]);
	});

	it("deletes builds from the new user when migrating", async () => {
		await BuildRepository.insert({
			title: "Test build",
			ownerId: users.id(2),
			headGearSplId: 1,
			clothesGearSplId: 1,
			shoesGearSplId: 1,
			abilities: [
				["SCU", "SCU", "SCU", "SCU"],
				["SCU", "SCU", "SCU", "SCU"],
				["SCU", "SCU", "SCU", "SCU"],
			],
			modes: null,
			weaponSplIds: [1],
			description: null,
			isPrivate: 0,
		});

		const buildsBefore = await BuildRepository.findAllByUserId(users.id(2));

		expect(buildsBefore.length).toBe(1);

		await migrateUserAction();

		const oldUser = await UserRepository.findProfileByIdentifier("0");
		expect(oldUser).toBeNull();

		for (const id of [users.id(1), users.id(2)]) {
			const buildsAfter = await BuildRepository.findAllByUserId(id);
			expect(buildsAfter.length).toBe(0);
		}
	});
});
