import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as BadgeRepository from "./BadgeRepository.server";
import { SPLATOON_3_XP_BADGE_VALUES } from "./badges-constants";

describe("syncXPBadges", () => {
	beforeEach(async () => {
		await dbInsertUsers(3);
		await insertXPBadges();
	});

	afterEach(() => {
		dbReset();
	});

	test("assigns badge to user with qualifying peakXp", async () => {
		await insertSplatoonPlayer({ splId: "abc123", userId: 1, peakXp: 3000 });

		await BadgeRepository.syncXPBadges();

		const badge = await findBadgeByCode("3000");
		expect(badge?.owners).toHaveLength(1);
		expect(badge?.owners[0].id).toBe(1);
	});

	test("assigns highest qualifying badge when peakXp exceeds threshold", async () => {
		await insertSplatoonPlayer({ splId: "abc123", userId: 1, peakXp: 3250 });

		await BadgeRepository.syncXPBadges();

		const badge3200 = await findBadgeByCode("3200");
		const badge3300 = await findBadgeByCode("3300");

		expect(badge3200?.owners).toHaveLength(1);
		expect(badge3300?.owners).toHaveLength(0);
	});

	test("does not assign badge when peakXp is below minimum threshold", async () => {
		await insertSplatoonPlayer({ splId: "abc123", userId: 1, peakXp: 2500 });

		await BadgeRepository.syncXPBadges();

		const badge2600 = await findBadgeByCode("2600");
		expect(badge2600?.owners).toHaveLength(0);
	});
});

async function insertXPBadges() {
	await db
		.insertInto("Badge")
		.values(
			SPLATOON_3_XP_BADGE_VALUES.map((value) => ({
				code: String(value),
				displayName: `${value}+ XP`,
				hue: null,
				authorId: null,
			})),
		)
		.execute();
}

async function insertSplatoonPlayer(args: {
	splId: string;
	userId: number | null;
	peakXp: number | null;
}) {
	await db.insertInto("SplatoonPlayer").values(args).execute();
}

async function findBadgeByCode(code: string) {
	const badges = await BadgeRepository.all();
	const badge = badges.find((b) => b.code === code);
	if (!badge) return null;
	return BadgeRepository.findById(badge.id);
}
