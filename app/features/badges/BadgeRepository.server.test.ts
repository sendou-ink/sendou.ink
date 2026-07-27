import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { dbReset } from "~/utils/Test";
import * as BadgeRepository from "./BadgeRepository.server";
import { SPLATOON_3_XP_BADGE_VALUES } from "./badges-constants";

describe("syncXPBadges", () => {
	let user: { id: number };

	beforeEach(async () => {
		user = await UserFactory.create();
		await insertXPBadges();
	});

	afterEach(async () => {
		await dbReset();
	});

	test("assigns badge to user with qualifying peakXp", async () => {
		await insertSplatoonPlayer({
			splId: "abc123",
			userId: user.id,
			peakXp: 3000,
		});

		await BadgeRepository.syncXPBadges();

		const badge = await findBadgeByCode("3000");
		expect(badge?.owners).toHaveLength(1);
		expect(badge?.owners[0].id).toBe(user.id);
	});

	test("assigns highest qualifying badge when peakXp exceeds threshold", async () => {
		await insertSplatoonPlayer({
			splId: "abc123",
			userId: user.id,
			peakXp: 3250,
		});

		await BadgeRepository.syncXPBadges();

		const badge3200 = await findBadgeByCode("3200");
		const badge3300 = await findBadgeByCode("3300");

		expect(badge3200?.owners).toHaveLength(1);
		expect(badge3300?.owners).toHaveLength(0);
	});

	test("does not assign badge when peakXp is below minimum threshold", async () => {
		await insertSplatoonPlayer({
			splId: "abc123",
			userId: user.id,
			peakXp: 2500,
		});

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
	await db
		.insertInto("SplatoonPlayer")
		.values({
			splId: args.splId,
			userId: args.userId,
			peakXp:
				args.peakXp === null
					? null
					: JSON.stringify({
							overall: args.peakXp,
							tentatek: args.peakXp,
							takoroka: null,
						}),
		})
		.execute();
}

async function findBadgeByCode(code: string) {
	const badges = await BadgeRepository.findAll();
	const badge = badges.find((b) => b.code === code);
	if (!badge) return null;
	return BadgeRepository.findById(badge.id);
}
