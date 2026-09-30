import { beforeEach, describe, expect, test } from "vitest";
import * as SkillFactory from "~/db/seed/factories/SkillFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import { USER_SKILLS_CACHE_KEY } from "~/features/sendouq/q-constants";
import { cache, IN_MILLISECONDS } from "~/utils/cache.server";
import { rankedUserSkill, userSkills } from "./tiered.server";

const SEASON = 1;

const users = UserFactory.pool();

const createSkill = (
	position: number,
	{ mu, matchesCount }: { mu: number; matchesCount: number },
) =>
	SkillFactory.create(
		{ userId: users.id(position), season: SEASON, mu },
		{ matchesCount },
	);

/** `null` is cachified's "never expires". */
const cachedTtl = () =>
	cache.get(`${USER_SKILLS_CACHE_KEY}-${SEASON}`)?.metadata.ttl;

describe("userSkills", () => {
	beforeEach(async () => {
		cache.clear();
		await users.create(1);
	});

	test("caches a seeded season indefinitely", async () => {
		await SkillFactory.create({ userId: users.id(1), season: SEASON });

		await userSkills(SEASON);

		expect(cachedTtl()).toBeNull();
	});

	test("expires a season whose initial skills are not seeded yet", async () => {
		await userSkills(SEASON);

		expect(cachedTtl()).toBe(IN_MILLISECONDS.HALF_HOUR);
	});
});

describe("rankedUserSkill", () => {
	const RANKED = MATCHES_COUNT_NEEDED_FOR_LEADERBOARD;

	beforeEach(async () => {
		cache.clear();
		await users.create(4);
	});

	test("places users by ordinal, tied ordinals sharing a placement", async () => {
		await createSkill(1, { mu: 30, matchesCount: RANKED });
		await createSkill(2, { mu: 28, matchesCount: RANKED });
		await createSkill(3, { mu: 28, matchesCount: RANKED });
		await createSkill(4, { mu: 26, matchesCount: RANKED });

		const placements = await Promise.all(
			users.ids(4).map(async (userId) => {
				const skill = await rankedUserSkill({ season: SEASON, userId });
				return skill?.leaderboardPlacement;
			}),
		);

		expect(placements).toEqual([1, 2, 2, 4]);
	});

	test("skips users without enough sets to be ranked", async () => {
		await createSkill(1, { mu: 30, matchesCount: RANKED - 1 });
		await createSkill(2, { mu: 28, matchesCount: RANKED });

		const skill = await rankedUserSkill({
			season: SEASON,
			userId: users.id(2),
		});

		expect(skill?.leaderboardPlacement).toBe(1);
	});

	test("returns null for a user without enough sets to be ranked", async () => {
		await createSkill(1, { mu: 30, matchesCount: RANKED - 1 });

		expect(
			await rankedUserSkill({ season: SEASON, userId: users.id(1) }),
		).toBeNull();
	});
});
