import { beforeEach, describe, expect, test } from "vitest";
import * as SkillFactory from "~/db/seed/factories/SkillFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";

const NEW_SEASON = 2;
const LAST_SEASON = 1;
const SEASON_BEFORE_LAST = 0;

const users = UserFactory.pool();
/** The +2 member, worst of last season's full players. */
const plusMemberId = () => users.id(10);

const seasonSkillsByUserId = async (season: number) => {
	const rows = await db
		.selectFrom("Skill")
		.select(["userId", "ordinal"])
		.where("season", "=", season)
		.execute();

	return new Map(rows.map((row) => [row.userId, row.ordinal]));
};

describe("season-initial-powers", () => {
	beforeEach(async () => {
		await users.create(10);
		await UserFactory.grant(plusMemberId(), { plusTier: 2 });
	});

	test("gives a plus member an initial power when their best recent season is one they barely played", async () => {
		// last season: everyone played a full season, the plus member landing last
		for (const [index, userId] of users.ids().entries()) {
			await SkillFactory.create(
				{ userId, season: LAST_SEASON, mu: 40 - index },
				{ matchesCount: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD },
			);
		}

		// the season before that the plus member only had their initial power (0 sets),
		// which alone in its season sits in the top tier
		await SkillFactory.create({
			userId: plusMemberId(),
			season: SEASON_BEFORE_LAST,
			mu: 30,
		});

		process.argv[2] = String(NEW_SEASON);
		await import("./season-initial-powers");

		const newSkills = await seasonSkillsByUserId(NEW_SEASON);

		// sanity: the script seeded the regular players
		expect(newSkills.has(users.id(1))).toBe(true);
		expect(newSkills.has(users.id(9))).toBe(true);

		expect(newSkills.has(plusMemberId())).toBe(true);
	});
});
