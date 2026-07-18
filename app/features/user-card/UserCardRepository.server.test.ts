import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/db/sql";
import { dbInsertUsers, dbReset, withNoUser, withUserId } from "~/utils/Test";
import * as UserCardRepository from "./UserCardRepository.server";
import type { UserCardData } from "./user-card-types";

const insertVerifiedXp = async (
	userId: number,
	power: number,
	region: "WEST" | "JPN" = "WEST",
) => {
	const player = await db
		.insertInto("SplatoonPlayer")
		.values({ splId: `spl-${userId}`, userId })
		.returning("id")
		.executeTakeFirstOrThrow();
	await db
		.insertInto("XRankPlacement")
		.values({
			playerId: player.id,
			weaponSplId: 0,
			badges: "[]",
			bannerSplId: 1,
			mode: "SZ",
			month: 1,
			year: 2024,
			name: "Test Player",
			nameDiscriminator: "0000",
			power,
			rank: 1,
			region,
			title: "Test",
		})
		.execute();
};

const findXpStat = (card: UserCardData | undefined) =>
	card?.stats.find((stat) => stat.type === "XP");

describe("UserCardRepository.userCards", () => {
	beforeEach(async () => {
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	it("returns an empty map when given no user ids", async () => {
		const { userCards } = await withNoUser(() =>
			UserCardRepository.userCards({
				userIds: [],
			}),
		);

		expect(userCards.size).toBe(0);
	});

	it("keys cards by user id and builds the stats array from db fields", async () => {
		await db
			.updateTable("User")
			.set({ div: "1" })
			.where("id", "=", 1)
			.execute();
		await db.insertInto("PlusTier").values({ userId: 1, tier: 2 }).execute();
		await insertVerifiedXp(1, 2500);

		const { userCards } = await withNoUser(() =>
			UserCardRepository.userCards({
				userIds: [1, 2],
			}),
		);

		expect(userCards.size).toBe(2);

		const card = userCards.get(1);
		expect(card?.id).toBe(1);
		expect(card?.freeAgentPostId).toBeNull();

		const statTypes = card?.stats.map((stat) => stat.type) ?? [];
		expect(statTypes).toContain("XP");
		expect(statTypes).toContain("DIV");
		expect(statTypes).toContain("PLUS");

		expect(findXpStat(card)).toMatchObject({
			type: "XP",
			values: [{ isVerified: true, region: "WEST", points: 2500 }],
		});
		expect(card?.stats.find((stat) => stat.type === "DIV")).toMatchObject({
			type: "DIV",
			value: "1",
		});
		expect(card?.stats.find((stat) => stat.type === "PLUS")).toMatchObject({
			type: "PLUS",
			value: 2,
		});

		// user 2 has none of the optional fields -> no stats
		expect(userCards.get(2)?.stats).toHaveLength(0);
	});

	it("surfaces self-reported peak XP only when it beats the verified XP", async () => {
		await insertVerifiedXp(1, 2500);
		await withUserId(1, () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: { overall: 2600, takoroka: null, tentatek: 2600 },
				hiddenCardStats: [],
			}),
		);

		const { userCards } = await withNoUser(() =>
			UserCardRepository.userCards({ userIds: [1] }),
		);

		expect(findXpStat(userCards.get(1))).toMatchObject({
			type: "XP",
			values: [
				{ isVerified: false, region: "WEST", points: 2600 },
				{ isVerified: true, region: "WEST", points: 2500 },
			],
		});
	});

	it("ignores self-reported peak XP that does not beat the verified XP", async () => {
		await insertVerifiedXp(1, 2500);
		await withUserId(1, () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: { overall: 2400, takoroka: null, tentatek: 2400 },
				hiddenCardStats: [],
			}),
		);

		const { userCards } = await withNoUser(() =>
			UserCardRepository.userCards({ userIds: [1] }),
		);

		expect(findXpStat(userCards.get(1))).toMatchObject({
			type: "XP",
			values: [{ isVerified: true, region: "WEST", points: 2500 }],
		});
	});

	it("ignores self-reported peak XP more than 200 above the verified XP", async () => {
		await insertVerifiedXp(1, 2500);
		await withUserId(1, () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: { overall: 2800, takoroka: null, tentatek: 2800 },
				hiddenCardStats: [],
			}),
		);

		const { userCards } = await withNoUser(() =>
			UserCardRepository.userCards({ userIds: [1] }),
		);

		expect(findXpStat(userCards.get(1))).toMatchObject({
			type: "XP",
			values: [{ isVerified: true, region: "WEST", points: 2500 }],
		});
	});

	it("ignores self-reported peak XP when there is no verified XP", async () => {
		await withUserId(1, () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: { overall: 3000, takoroka: 3000, tentatek: null },
				hiddenCardStats: [],
			}),
		);

		const { userCards } = await withNoUser(() =>
			UserCardRepository.userCards({ userIds: [1] }),
		);

		expect(findXpStat(userCards.get(1))).toBeUndefined();
	});

	it("persists edited card fields and surfaces hidden stats", async () => {
		await db.insertInto("PlusTier").values({ userId: 1, tier: 2 }).execute();
		await insertVerifiedXp(1, 2500);

		await withUserId(1, () =>
			UserCardRepository.updateOwnCard({
				shortBio: "hello",
				bannerPresetImg: "#ff4655",
				bannerImgId: null,
				unverifiedPeakXP: null,
				hiddenCardStats: ["XP"],
			}),
		);

		const { userCards } = await withUserId(1, () =>
			UserCardRepository.userCards({
				userIds: [1],
			}),
		);
		const card = userCards.get(1);

		expect(card?.shortBio).toBe("hello");
		expect(card?.banner).toMatchObject({ type: "COLOR", hexCode: "#ff4655" });
		// the hidden stat is filtered out of `stats` at query time
		expect(findXpStat(card)).toBeUndefined();
		expect(card?.stats.find((stat) => stat.type === "PLUS")).toMatchObject({
			type: "PLUS",
			value: 2,
		});

		const extras = await UserCardRepository.cardEditExtras(1);
		expect(extras.hiddenCardStats).toEqual(["XP"]);
	});

	it("keeps hidden stats in `stats` when includeHiddenStats is set", async () => {
		await insertVerifiedXp(1, 2500);

		await withUserId(1, () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: null,
				hiddenCardStats: ["XP"],
			}),
		);

		const { userCards } = await withUserId(1, () =>
			UserCardRepository.userCards({
				userIds: [1],
				includeHiddenStats: true,
			}),
		);
		const card = userCards.get(1);

		expect(findXpStat(card)).toMatchObject({
			type: "XP",
			values: [{ isVerified: true, region: "WEST", points: 2500 }],
		});
	});

	it("produces a URL banner when an uploaded banner image is set", async () => {
		const image = await db
			.insertInto("UnvalidatedUserSubmittedImage")
			.values({ url: "banner.webp", submitterUserId: 1, validatedAt: 1 })
			.returning("id")
			.executeTakeFirstOrThrow();

		await withUserId(1, () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: image.id,
				unverifiedPeakXP: null,
				hiddenCardStats: [],
			}),
		);

		const { userCards } = await withUserId(1, () =>
			UserCardRepository.userCards({
				userIds: [1],
			}),
		);

		const banner = userCards.get(1)?.banner;
		expect(banner?.type).toBe("URL");
		expect(banner).toHaveProperty("url");
	});
});
