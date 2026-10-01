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

describe("badges.managedBy", () => {
	const users = UserFactory.pool();

	beforeEach(async () => {
		await users.create(3);
	});

	test("returns each badge any of the users manages once", async () => {
		const shared = await BadgeFactory.create(null, {
			managerIds: [users.id(1), users.id(2)],
		});
		const ownOnly = await BadgeFactory.create(null, {
			managerIds: [users.id(2)],
		});
		await BadgeFactory.create(null, { managerIds: [users.id(3)] });

		const managed = await BadgeRepository.badges()
			.managedBy([users.id(1), users.id(2)])
			.execute();

		expect(managed.map((badge) => badge.id)).toEqual([shared.id, ownOnly.id]);
	});
});

describe("replaceManagers", () => {
	test("empty list clears existing managers", async () => {
		const user = await UserFactory.create();
		const badge = await BadgeFactory.create(null, { managerIds: [user.id] });

		await BadgeRepository.replaceManagers({
			badgeId: badge.id,
			managerIds: [],
		});

		const updated = await BadgeRepository.badgeDetails(
			badge.id,
		).executeTakeFirst();
		expect(updated?.managers).toHaveLength(0);
	});
});

describe("replaceOwners", () => {
	test("empty list clears existing owners", async () => {
		const user = await UserFactory.create();
		const badge = await BadgeFactory.create(null, { ownerIds: [user.id] });

		await BadgeRepository.replaceOwners({ badgeId: badge.id, ownerIds: [] });

		const updated = await BadgeRepository.badgeDetails(
			badge.id,
		).executeTakeFirst();
		expect(updated?.owners).toHaveLength(0);
	});
});

/** Gives the user a linked X Rank player whose one placement is worth `power`. */
const givePeakXp = (userId: number, power: number) =>
	XRankPlacementFactory.create(
		{ playerUserId: userId, power },
		{ refreshPeakXp: true },
	);

async function findBadgeByCode(code: string) {
	const badge = await BadgeRepository.badges()
		.where({ code })
		.executeTakeFirst();
	if (!badge) return null;
	return BadgeRepository.badgeDetails(badge.id).executeTakeFirst();
}
