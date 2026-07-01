import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/db/sql";
import { dbInsertUsers, dbReset, withUserId } from "~/utils/Test";
import * as UserCardRepository from "./UserCardRepository.server";

describe("UserCardRepository.userCards", () => {
	beforeEach(async () => {
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	it("returns an empty map when given no user ids", async () => {
		const { userCards } = await UserCardRepository.userCards({
			userIds: [],
			viewerId: null,
		});

		expect(userCards.size).toBe(0);
	});

	it("keys cards by user id and builds the stats array from db fields", async () => {
		await db
			.updateTable("User")
			.set({
				div: "1",
				unverifiedPeakXP: JSON.stringify({
					overall: 3000,
					takoroka: 3000,
					tentatek: null,
				}),
			})
			.where("id", "=", 1)
			.execute();
		await db.insertInto("PlusTier").values({ userId: 1, tier: 2 }).execute();

		const { userCards } = await UserCardRepository.userCards({
			userIds: [1, 2],
			viewerId: null,
		});

		expect(userCards.size).toBe(2);

		const card = userCards.get(1);
		expect(card?.id).toBe(1);
		expect(card?.freeAgentPostId).toBeNull();

		const statTypes = card?.stats.map((stat) => stat.type) ?? [];
		expect(statTypes).toContain("XP");
		expect(statTypes).toContain("DIV");
		expect(statTypes).toContain("PLUS");

		expect(card?.stats.find((stat) => stat.type === "XP")).toMatchObject({
			type: "XP",
			values: [{ isVerified: false, region: "JPN", points: 3000 }],
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

	it("persists edited card fields and surfaces hidden stats", async () => {
		await db.insertInto("PlusTier").values({ userId: 1, tier: 2 }).execute();

		await withUserId(1, () =>
			UserCardRepository.updateOwnCard({
				shortBio: "hello",
				bannerPresetImg: "#ff4655",
				bannerImgId: null,
				unverifiedPeakXP: { overall: 2500, takoroka: null, tentatek: 2500 },
				hiddenCardStats: ["XP"],
			}),
		);

		const { userCards } = await UserCardRepository.userCards({
			userIds: [1],
			viewerId: 1,
		});
		const card = userCards.get(1);

		expect(card?.shortBio).toBe("hello");
		expect(card?.banner).toMatchObject({ type: "COLOR", hexCode: "#ff4655" });
		// the hidden stat is filtered out of `stats` at query time
		expect(card?.stats.find((stat) => stat.type === "XP")).toBeUndefined();
		expect(card?.stats.find((stat) => stat.type === "PLUS")).toMatchObject({
			type: "PLUS",
			value: 2,
		});

		const extras = await UserCardRepository.cardEditExtras(1);
		expect(extras.hiddenCardStats).toEqual(["XP"]);
	});

	it("keeps hidden stats in `stats` when includeHiddenStats is set", async () => {
		await db.insertInto("PlusTier").values({ userId: 1, tier: 2 }).execute();

		await withUserId(1, () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: { overall: 2500, takoroka: null, tentatek: 2500 },
				hiddenCardStats: ["XP"],
			}),
		);

		const { userCards } = await UserCardRepository.userCards({
			userIds: [1],
			viewerId: 1,
			includeHiddenStats: true,
		});
		const card = userCards.get(1);

		expect(card?.stats.find((stat) => stat.type === "XP")).toMatchObject({
			type: "XP",
			values: [{ isVerified: false, region: "WEST", points: 2500 }],
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

		const { userCards } = await UserCardRepository.userCards({
			userIds: [1],
			viewerId: 1,
		});

		const banner = userCards.get(1)?.banner;
		expect(banner?.type).toBe("URL");
		expect(banner).toHaveProperty("url");
	});
});
