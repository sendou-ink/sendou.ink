import { minutesToMilliseconds } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as SkillFactory from "~/db/seed/factories/SkillFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import { USER_SKILLS_CACHE_KEY } from "~/features/sendouq/q-constants";
import { cache } from "~/utils/cache.server";
import { USER_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN } from "./mmr-constants";
import { freshUserSkills, rankedUserSkill, userSkills } from "./tiered.server";

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

/** Players `from` onwards of the pool, each worse than the one before. */
const createSkills = (
	count: number,
	{ matchesCount, from = 1 }: { matchesCount: number; from?: number },
) =>
	SkillFactory.createMany(
		count,
		(i) => ({ userId: users.id(from + i), season: SEASON, mu: 50 - i * 0.1 }),
		{ matchesCount },
	);

const tierOf = (
	skills: Awaited<ReturnType<typeof freshUserSkills>>,
	position: number,
) => {
	const { name, isPlus } = skills.userSkills[users.id(position)].tier;

	return `${name}${isPlus ? "+" : ""}`;
};

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

		expect(cachedTtl()).toBe(minutesToMilliseconds(30));
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

describe("freshUserSkills", () => {
	const RANKED = MATCHES_COUNT_NEEDED_FOR_LEADERBOARD;
	const LEVIATHAN_PLAYERS = USER_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN;

	test("a lone player gets the top tier", async () => {
		await users.create(1);
		await createSkills(1, { matchesCount: 0 });

		expect(tierOf(await freshUserSkills(SEASON), 1)).toBe("DIAMOND+");
	});

	test.each([
		{ why: "ranked", matchesCount: RANKED },
		{ why: "without enough sets to be ranked", matchesCount: 0 },
	])(
		"before Leviathan the best player gets the top tier and the worst the lowest ($why)",
		async ({ matchesCount }) => {
			await users.create(20);
			await createSkills(20, { matchesCount });

			const skills = await freshUserSkills(SEASON);

			expect(tierOf(skills, 1)).toBe("DIAMOND+");
			expect(tierOf(skills, 20)).toBe("IRON");
		},
	);

	test.each([
		{
			why: "enough ranked players",
			rankedCount: LEVIATHAN_PLAYERS,
			bestTier: "LEVIATHAN+",
			isAccurateTiers: true,
		},
		{
			why: "one ranked player short",
			rankedCount: LEVIATHAN_PLAYERS - 1,
			bestTier: "DIAMOND+",
			isAccurateTiers: false,
		},
	])(
		"Leviathan unlocks once enough players are ranked ($why)",
		async ({ rankedCount, bestTier, isAccurateTiers }) => {
			await users.create(rankedCount);
			await createSkills(rankedCount, { matchesCount: RANKED });

			const skills = await freshUserSkills(SEASON);

			expect(tierOf(skills, 1)).toBe(bestTier);
			expect(skills.isAccurateTiers).toBe(isAccurateTiers);
		},
	);

	test("the top 5% of ranked players are Leviathan, the better half of them Leviathan+", async () => {
		await users.create(LEVIATHAN_PLAYERS);
		await createSkills(LEVIATHAN_PLAYERS, { matchesCount: RANKED });

		const skills = await freshUserSkills(SEASON);
		const tiers = users.ids().map((_, i) => tierOf(skills, i + 1));

		expect(tiers.filter((tier) => tier === "LEVIATHAN+")).toHaveLength(
			LEVIATHAN_PLAYERS * 0.025,
		);
		expect(tiers.filter((tier) => tier === "LEVIATHAN")).toHaveLength(
			LEVIATHAN_PLAYERS * 0.025,
		);
	});

	test("once Leviathan is unlocked, players without enough sets don't shape the tiers", async () => {
		const UNRANKED_COUNT = 50;
		await users.create(UNRANKED_COUNT + LEVIATHAN_PLAYERS);
		// better than every ranked player
		await SkillFactory.createMany(
			UNRANKED_COUNT,
			(i) => ({ userId: users.id(i + 1), season: SEASON, mu: 60 - i * 0.1 }),
			{ matchesCount: RANKED - 1 },
		);
		await createSkills(LEVIATHAN_PLAYERS, {
			matchesCount: RANKED,
			from: UNRANKED_COUNT + 1,
		});

		const skills = await freshUserSkills(SEASON);

		expect(tierOf(skills, UNRANKED_COUNT + 1)).toBe("LEVIATHAN+");
	});
});
