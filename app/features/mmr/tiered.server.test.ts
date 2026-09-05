import { beforeEach, describe, expect, test } from "vitest";
import * as SkillFactory from "~/db/seed/factories/SkillFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { USER_SKILLS_CACHE_KEY } from "~/features/sendouq/q-constants";
import { cache, IN_MILLISECONDS } from "~/utils/cache.server";
import { userSkills } from "./tiered.server";

const SEASON = 1;

const users = UserFactory.pool();

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
