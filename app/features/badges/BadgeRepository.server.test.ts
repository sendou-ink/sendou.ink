import { beforeEach, describe, expect, test } from "vitest";
import * as BadgeFactory from "~/db/seed/factories/BadgeFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as XRankPlacementFactory from "~/db/seed/factories/XRankPlacementFactory";
import * as BadgeRepository from "./BadgeRepository.server";
import { SPLATOON_3_XP_BADGE_VALUES } from "./badges-constants";

describe("syncXPBadges", () => {
	let user: { id: number };

	beforeEach(async () => {
		user = await UserFactory.create();
		await BadgeFactory.createMany(SPLATOON_3_XP_BADGE_VALUES.length, (i) => ({
			code: String(SPLATOON_3_XP_BADGE_VALUES[i]),
			displayName: `${SPLATOON_3_XP_BADGE_VALUES[i]}+ XP`,
		}));
	});

	test("assigns badge to user with qualifying peakXp", async () => {
		await givePeakXp(user.id, 3000);

		await BadgeRepository.syncXPBadges();

		const badge = await findBadgeByCode("3000");
		expect(badge?.owners).toHaveLength(1);
		expect(badge?.owners[0].id).toBe(user.id);
	});

	test("assigns highest qualifying badge when peakXp exceeds threshold", async () => {
		await givePeakXp(user.id, 3250);

		await BadgeRepository.syncXPBadges();

		const badge3200 = await findBadgeByCode("3200");
		const badge3300 = await findBadgeByCode("3300");

		expect(badge3200?.owners).toHaveLength(1);
		expect(badge3300?.owners).toHaveLength(0);
	});

	test("does not assign badge when peakXp is below minimum threshold", async () => {
		await givePeakXp(user.id, 2500);

		await BadgeRepository.syncXPBadges();

		const badge2600 = await findBadgeByCode("2600");
		expect(badge2600?.owners).toHaveLength(0);
	});
});

/** Gives the user a linked X Rank player whose one placement is worth `power`. */
const givePeakXp = (userId: number, power: number) =>
	XRankPlacementFactory.create(
		{ playerUserId: userId, power },
		{ refreshPeakXp: true },
	);

async function findBadgeByCode(code: string) {
	const badges = await BadgeRepository.findAll();
	const badge = badges.find((b) => b.code === code);
	if (!badge) return null;
	return BadgeRepository.findById(badge.id);
}
