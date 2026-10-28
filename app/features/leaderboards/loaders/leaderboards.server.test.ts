import { beforeEach, describe, expect, test } from "vitest";
import * as SkillFactory from "~/db/seed/factories/SkillFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as Seasons from "~/features/mmr/core/Seasons";
import { wrappedLoader } from "~/utils/Test";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "../leaderboards-constants";
import { loader } from "./leaderboards.server";

const SEASON = Seasons.currentOrPrevious()!.nth;

const leaderboardsLoader = wrappedLoader<Awaited<ReturnType<typeof loader>>>({
	loader,
});

const users = UserFactory.pool();
const skippedUserId = () => users.id(1);

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

describe("leaderboards loader", () => {
	beforeEach(async () => {
		await users.create(2);
		await SkillFactory.createMany(
			2,
			(index) => ({
				userId: users.id(index + 1),
				season: SEASON,
				mu: 2 - index,
			}),
			{ matchesCount: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD },
		);
		await skipPlusForSeason(skippedUserId(), SEASON);
	});

	test("does not expose which players skipped plus server admission", async () => {
		const data = await leaderboardsLoader();

		const skippedEntry = data.userLeaderboard?.find(
			(entry) => entry.id === skippedUserId(),
		);

		expect(skippedEntry).toBeDefined();
		expect(skippedEntry).not.toHaveProperty("plusSkippedForSeasonNth");
	});
});
