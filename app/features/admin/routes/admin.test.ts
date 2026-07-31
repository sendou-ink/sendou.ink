import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";
import * as BuildFactory from "~/db/seed/factories/BuildFactory";
import * as PlusVoteFactory from "~/db/seed/factories/PlusVoteFactory";
import * as SkillFactory from "~/db/seed/factories/SkillFactory";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import type { adminActionSchema } from "../admin-schemas";
import { action } from "./admin";

const adminAction = wrappedAction<typeof adminActionSchema>({
	action,
	isJsonSubmission: true,
});

const users = UserFactory.pool();

// account migration is asserted through Discord ids, so the tests give the users
// one they can name
const createUsers = (count = 2) =>
	users.create(count, (index) => ({ discordId: String(index) }));

const countPlusTierMembers = (tier = 1) =>
	db
		.selectFrom("PlusTier")
		.where("PlusTier.tier", "=", tier)
		.select(({ fn }) => fn.count<number>("PlusTier.tier").as("count"))
		.executeTakeFirstOrThrow()
		.then((row) => row.count);

/** Ranks the given users, the first of them topping the leaderboard. */
const createLeaderboard = (userIds: number[]) =>
	SkillFactory.createMany(
		userIds.length,
		(index) => ({ userId: userIds[index], mu: userIds.length - index }),
		{ matchesCount: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD },
	);

/** Marks a user as skipping the plus server for the given season. */
const skipPlusForSeason = (userId: number, seasonNth: number) =>
	// the app only ever reads the column; the one thing that sets it is
	// `scripts/skip-plus.ts`, itself a raw update with no repository function behind it
	// biome-ignore lint/plugin: no production write reaches the column
	db
		.updateTable("User")
		.set({ plusSkippedForSeasonNth: seasonNth })
		.where("User.id", "=", userId)
		.execute();

describe("Plus voting", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(async () => {
		vi.useRealTimers();
	});

	test("gives correct amount of plus tiers", async () => {
		vi.setSystemTime(new Date("2023-12-12T00:00:00.000Z"));

		await createUsers(10);
		await PlusVoteFactory.createMany(10, (index) => ({
			authorId: users.id(1),
			votedId: users.id(index + 1),
			score: index < 5 ? -1 : 1,
		}));

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers()).toBe(5);
	});

	test("60% or more guarantees pass", async () => {
		vi.setSystemTime(new Date("2023-12-12T00:00:00.000Z"));

		await createUsers(10);

		// 60% - auto-pass
		await PlusVoteFactory.createMany(10, (index) => ({
			authorId: users.id(index + 1),
			votedId: users.id(1),
			score: index < 4 ? -1 : 1,
		}));

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers()).toBe(1);
	});

	test("40% or less does not pass", async () => {
		vi.setSystemTime(new Date("2023-12-12T00:00:00.000Z"));

		await createUsers(10);

		// 40% - auto-fail
		await PlusVoteFactory.createMany(10, (index) => ({
			authorId: users.id(index + 1),
			votedId: users.id(1),
			score: index < 6 ? -1 : 1,
		}));

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers()).toBe(0);
	});

	test("middle zone (40-60%) passes when quota has room", async () => {
		vi.setSystemTime(new Date("2023-12-12T00:00:00.000Z"));

		await createUsers(10);

		// 50% - middle zone, should pass (quota=50 for tier 1)
		await PlusVoteFactory.createMany(10, (index) => ({
			authorId: users.id(index + 1),
			votedId: users.id(1),
			score: index < 5 ? -1 : 1,
		}));

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers()).toBe(1);
	});

	test("combines leaderboard and voting results (after season over)", async () => {
		vi.setSystemTime(new Date("2023-11-29T00:00:00.000Z"));

		await createUsers();
		await PlusVoteFactory.create({
			authorId: users.id(1),
			votedId: users.id(1),
			score: 1,
		});
		await createLeaderboard([users.id(2)]);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers()).toBe(2);
	});

	test("skips users from leaderboard with the skip flag for the season", async () => {
		vi.setSystemTime(new Date("2023-11-29T00:00:00.000Z"));

		await createUsers(11);
		await createLeaderboard(users.ids());

		await skipPlusForSeason(users.id(1), 1);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers(1)).toBe(5);
		expect(await countPlusTierMembers(2)).toBe(5);
	});

	test("plus server skip flag ignored if for past season", async () => {
		vi.setSystemTime(new Date("2023-11-29T00:00:00.000Z"));

		await createUsers(11);
		await createLeaderboard(users.ids());

		await skipPlusForSeason(users.id(1), 0);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers(1)).toBe(5);
		expect(await countPlusTierMembers(2)).toBe(6);
	});

	test("ignores leaderboard while season is ongoing", async () => {
		vi.setSystemTime(new Date("2024-02-15T00:00:00.000Z"));

		await createUsers();
		await PlusVoteFactory.create({
			authorId: users.id(1),
			votedId: users.id(1),
			score: 1,
		});
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
		await PlusVoteFactory.create({
			authorId: users.id(1),
			votedId: users.id(1),
			score: -1,
		});
		await createLeaderboard([users.id(1)]);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers(1)).toBe(1);
	});

	test("gives membership if failed voting and is on the leaderboard and season ended last month", async () => {
		vi.setSystemTime(new Date("2023-12-29T00:00:00.000Z"));

		await createUsers(1);
		await PlusVoteFactory.create({
			authorId: users.id(1),
			votedId: users.id(1),
			score: -1,
		});
		await createLeaderboard([users.id(1)]);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers(1)).toBe(1);
	});

	test("members who fails voting drops one tier", async () => {
		vi.setSystemTime(new Date("2024-02-15T00:00:00.000Z"));

		await createUsers(1);
		await PlusVoteFactory.create({
			authorId: users.id(1),
			votedId: users.id(1),
			score: 1,
			month: 11,
			year: 2023,
		});

		await PlusVoteFactory.create({
			authorId: users.id(1),
			votedId: users.id(1),
			score: -1,
			month: 2,
			year: 2024,
		});

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers(2)).toBe(1);
	});
});

const migrateUserAction = () =>
	adminAction(
		{
			_action: "MIGRATE",
			oldUser: users.id(1),
			newUser: users.id(2),
		},
		{ user: "admin" },
	);

describe("Account migration", () => {
	beforeEach(async () => {
		await createUsers(2);
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
		await TeamFactory.create({ memberUserIds: [users.id(1)] });
		await TeamFactory.create({ memberUserIds: [users.id(2)] });

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
		const team = await TeamFactory.create({ memberUserIds: [users.id(2)] });
		await TeamRepository.deleteById(team.id);

		const membershipBeforeMigration = await membershipOf(users.id(2));
		expect(membershipBeforeMigration).toBeDefined();

		await migrateUserAction();

		const membershipAfterMigration = await membershipOf(users.id(2));

		expect(membershipAfterMigration).toBeUndefined();
	});

	it("handles old user member of the same team as new user (old user has left the team, new user current)", async () => {
		const team = await TeamFactory.create({
			memberUserIds: [users.id(2), users.id(1)],
		});
		await TeamRepository.handleMemberLeaving({
			teamId: team.id,
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
		await UserFactory.grant(users.id(1), {
			weapons: [{ weaponSplId: 1, isFavorite: 1 }],
		});
		await UserFactory.grant(users.id(2), { weapons: [{ weaponSplId: 10 }] });

		await migrateUserAction();

		const oldUser = await UserRepository.findProfileByIdentifier("0");
		const newUser = await UserRepository.findProfileByIdentifier("1");

		expect(oldUser).toBeNull();
		expect(newUser?.weapons).toEqual([
			{ weaponSplId: 1, isFavorite: 1, isTenStar: 0 },
		]);
	});

	it("deletes builds from the new user when migrating", async () => {
		await BuildFactory.create({ ownerId: users.id(2) });

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
