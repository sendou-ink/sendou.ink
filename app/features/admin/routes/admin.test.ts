import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "~/db/sql";
import * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import { dbInsertUsers, dbReset, wrappedAction } from "~/utils/Test";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import type { adminActionSchema } from "../actions/admin.server";
import { action } from "./admin";

const adminAction = wrappedAction<typeof adminActionSchema>({ action });

const voteArgs = ({
	score,
	votedId,
	authorId = 1,
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
	validAfter: dateToDatabaseTimestamp(new Date("2021-12-11T00:00:00.000Z")),
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

	afterEach(() => {
		vi.useRealTimers();
		dbReset();
	});

	test("gives correct amount of plus tiers", async () => {
		vi.setSystemTime(new Date("2023-12-12T00:00:00.000Z"));

		await dbInsertUsers(10);
		await PlusVotingRepository.upsertMany(
			Array.from({ length: 10 }).map((_, i) => {
				const id = i + 1;

				return voteArgs({
					score: id <= 5 ? -1 : 1,
					votedId: id,
				});
			}),
		);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers()).toBe(5);
	});

	test("60% is the criteria to pass voting", async () => {
		vi.setSystemTime(new Date("2023-12-12T00:00:00.000Z"));

		await dbInsertUsers(10);

		// 50%
		await PlusVotingRepository.upsertMany(
			Array.from({ length: 10 }).map((_, i) => {
				return voteArgs({
					authorId: i + 1,
					score: i < 5 ? -1 : 1,
					votedId: 1,
				});
			}),
		);
		// 60%
		await PlusVotingRepository.upsertMany(
			Array.from({ length: 10 }).map((_, i) => {
				return voteArgs({
					authorId: i + 1,
					score: i < 4 ? -1 : 1,
					votedId: 2,
				});
			}),
		);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		const rows = await db
			.selectFrom("PlusTier")
			.select(["PlusTier.tier", "PlusTier.userId"])
			.where("PlusTier.tier", "=", 1)
			.execute();

		expect(rows.length).toBe(1);
		expect(rows[0].userId).toBe(2);
	});

	test("combines leaderboard and voting results (after season over)", async () => {
		vi.setSystemTime(new Date("2023-11-29T00:00:00.000Z"));

		await dbInsertUsers();
		await PlusVotingRepository.upsertMany([
			voteArgs({
				score: 1,
				votedId: 1,
			}),
		]);
		await createLeaderboard([2]);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers()).toBe(2);
	});

	test("skips users from leaderboard with the skip flag for the season", async () => {
		vi.setSystemTime(new Date("2023-11-29T00:00:00.000Z"));

		await dbInsertUsers(11);
		await createLeaderboard(Array.from({ length: 11 }).map((_, i) => i + 1));

		await db
			.updateTable("User")
			.set({ plusSkippedForSeasonNth: 1 })
			.where("User.id", "=", 1)
			.execute();

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers(1)).toBe(10);
		expect(await countPlusTierMembers(2)).toBe(0);
	});

	test("plus server skip flag ignored if for past season", async () => {
		vi.setSystemTime(new Date("2023-11-29T00:00:00.000Z"));

		await dbInsertUsers(11);
		await createLeaderboard(Array.from({ length: 11 }).map((_, i) => i + 1));

		await db
			.updateTable("User")
			.set({ plusSkippedForSeasonNth: 0 })
			.where("User.id", "=", 1)
			.execute();

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers(1)).toBe(10);
		expect(await countPlusTierMembers(2)).toBe(1);
	});

	test("ignores leaderboard while season is ongoing", async () => {
		vi.setSystemTime(new Date("2024-02-15T00:00:00.000Z"));

		await dbInsertUsers();
		await PlusVotingRepository.upsertMany([
			voteArgs({
				score: 1,
				votedId: 1,
			}),
		]);
		await createLeaderboard([2]);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers()).toBe(1);
		expect(await countPlusTierMembers(2)).toBe(0);
	});

	test("leaderboard gives members to all tiers", async () => {
		vi.setSystemTime(new Date("2023-11-20T00:00:00.000Z"));

		await dbInsertUsers(60);
		await createLeaderboard(Array.from({ length: 60 }, (_, i) => i + 1));

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers()).toBeGreaterThan(0);
		expect(await countPlusTierMembers(2)).toBeGreaterThan(0);
		expect(await countPlusTierMembers(3)).toBeGreaterThan(0);
	});

	test("gives membership if failed voting and is on the leaderboard", async () => {
		vi.setSystemTime(new Date("2023-11-29T00:00:00.000Z"));

		await dbInsertUsers(1);
		await PlusVotingRepository.upsertMany([
			voteArgs({
				score: -1,
				votedId: 1,
			}),
		]);
		await createLeaderboard([1]);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers(1)).toBe(1);
	});

	test("members who fails voting drops one tier", async () => {
		vi.setSystemTime(new Date("2024-02-15T00:00:00.000Z"));

		await dbInsertUsers(1);
		await PlusVotingRepository.upsertMany([
			voteArgs({
				score: 1,
				votedId: 1,
				month: 11,
				year: 2023,
			}),
		]);

		await PlusVotingRepository.upsertMany([
			voteArgs({
				score: -1,
				votedId: 1,
				month: 2,
				year: 2024,
			}),
		]);

		await adminAction({ _action: "REFRESH" }, { user: "admin" });

		expect(await countPlusTierMembers(2)).toBe(1);
	});
});
