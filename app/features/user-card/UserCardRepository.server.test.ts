import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/db/sql";
import { dbInsertUsers, dbReset } from "~/utils/Test";
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
		expect(card?.isFreeAgent).toBe(false);

		const statTypes = card?.stats.map((stat) => stat.type) ?? [];
		expect(statTypes).toContain("XP");
		expect(statTypes).toContain("DIV");
		expect(statTypes).toContain("PLUS");

		expect(card?.stats.find((stat) => stat.type === "XP")).toMatchObject({
			type: "XP",
			values: [{ isVerified: false, div: "TAKOROKA", points: 3000 }],
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
});
